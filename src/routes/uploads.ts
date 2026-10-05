import type { Hono } from "hono";
import { z } from "zod";
import { getSql } from "../db/client.js";
import { fail } from "../lib/http.js";
import { newFileId } from "../lib/ids.js";
import { EXT_MIME, mimeFromName, verifySignature } from "../lib/fileSignature.js";
import { computePhase } from "../lib/phase.js";
import { enforceRateLimit } from "../lib/rateLimit.js";
import { createUploadUrl, getObjectSize, readObjectHead, removeObject } from "../storage/index.js";
import { requireParticipant } from "../auth/middleware.js";

const uploadSchema = z.object({ name: z.string().min(1).max(255), size: z.number().int().positive() });
const MAX_FILE = 50 * 1024 * 1024;

interface SettingsRow {
  submissionDeadline: string;
  voteStart: string;
  voteEnd: string;
  uploadsEnabled: boolean;
}

async function currentSettings(): Promise<SettingsRow> {
  const sql = getSql();
  const rows = await sql<{ payload: SettingsRow }[]>`select payload from settings where id = 1`;
  const payload = rows[0]?.payload;
  if (!payload) fail("server_error");
  return payload;
}

export function registerUploadRoutes(app: Hono) {
  // ① POST /api/uploads {name,size} — 서명 업로드 URL 발급 (SSOT 6.3)
  app.post("/api/uploads", async (c) => {
    const session = await requireParticipant(c);
    await enforceRateLimit(session.participantId, "uploads", 60, 60);

    const settings = await currentSettings();
    if (computePhase(settings) !== "submitting" || !settings.uploadsEnabled) fail("submissions_closed");

    const body = uploadSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) fail("invalid_input");
    const { name, size } = body.data;

    const mime = mimeFromName(name);
    if (!mime) fail("invalid_file");
    if (size <= 0 || size > MAX_FILE) fail("file_too_large");

    const sql = getSql();
    const id = newFileId();
    await sql`insert into files (id, name, mime, size, participant_id, work_id, uploaded_at)
              values (${id}, ${name}, ${mime}, ${size}, ${session.participantId}, null, null)`;

    const uploadUrl = await createUploadUrl(id);
    return c.json({ id, name, mime, size, uploadUrl }, 201);
  });

  // ③ POST /api/uploads/{id}/complete — 크기·시그니처 검사 (SSOT 6.3)
  app.post("/api/uploads/:fileId/complete", async (c) => {
    const session = await requireParticipant(c);
    const fileId = c.req.param("fileId");
    const sql = getSql();
    const rows = await sql<{ id: string; name: string; mime: string; size: number; participant_id: string; work_id: string | null; uploaded_at: Date | null }[]>`
      select id, name, mime, size, participant_id, work_id, uploaded_at from files where id = ${fileId}
    `;
    const file = rows[0];
    if (!file || file.participant_id !== session.participantId) fail("not_found");
    if (file.work_id !== null) fail("invalid_file");
    if (file.uploaded_at) return c.json({ ok: true });

    const actualSize = await getObjectSize(fileId);
    if (actualSize === null || actualSize !== Number(file.size)) {
      await removeObject(fileId);
      await sql`delete from files where id = ${fileId}`;
      fail("invalid_file_content");
    }

    const head = await readObjectHead(fileId, 4096);
    if (!head || !verifySignature(file.mime, head)) {
      await removeObject(fileId);
      await sql`delete from files where id = ${fileId}`;
      fail("invalid_file_content");
    }

    await sql`update files set uploaded_at = now() where id = ${fileId}`;
    return c.json({ ok: true });
  });

  // DELETE /api/staged/{fileId} — 작품에 아직 귀속되지 않은 파일 삭제
  app.delete("/api/staged/:fileId", async (c) => {
    const session = await requireParticipant(c);
    const fileId = c.req.param("fileId");
    const sql = getSql();
    const rows = await sql<{ id: string; participant_id: string; work_id: string | null }[]>`
      select id, participant_id, work_id from files where id = ${fileId}
    `;
    const file = rows[0];
    if (!file || file.participant_id !== session.participantId || file.work_id !== null) {
      return c.json({ ok: true }); // 멱등 처리
    }
    await removeObject(fileId);
    await sql`delete from files where id = ${fileId}`;
    return c.json({ ok: true });
  });
}

export { EXT_MIME };
