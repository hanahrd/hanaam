import type { Hono } from "hono";
import { z } from "zod";
import { getSql } from "../db/client";
import { fail, isUniqueViolation } from "../lib/http";
import { newWorkId } from "../lib/ids";
import { computePhase } from "../lib/phase";
import { createDownloadUrl } from "../storage";
import { requireAdminSession, requireMemberSession, requireParticipant } from "../auth/middleware";

const CATEGORIES = ["PPT", "이미지", "영상", "업무자동화", "기타"] as const;
const MAX_TOTAL = 100 * 1024 * 1024;

const workSchema = z.object({
  title: z.string().min(2).max(90),
  category: z.enum(CATEGORIES),
  tools: z.string().max(150).default(""),
  description: z.string().min(10).max(5000),
  fileIds: z.array(z.string()).min(1).max(5),
  consent: z.literal(true),
});

interface SettingsRow {
  submissionDeadline: string;
  voteStart: string;
  voteEnd: string;
  uploadsEnabled: boolean;
  requireApproval: boolean;
}

export function registerWorkRoutes(app: Hono) {
  // ④ POST /api/works — 트랜잭션: settings FOR SHARE → 파일 확인 → works INSERT (SSOT 6.3, 7.2)
  app.post("/api/works", async (c) => {
    const session = await requireParticipant(c);
    const body = workSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) fail("invalid_input");
    const { title, category, tools, description, fileIds, consent } = body.data;
    if (!consent) fail("consent_required");
    if (new Set(fileIds).size !== fileIds.length) fail("invalid_file");

    const sql = getSql();
    const workId = newWorkId();
    let pending = false;

    await sql.begin(async (tx) => {
      const settingsRows = await tx<{ payload: SettingsRow }[]>`select payload from settings where id = 1 for share`;
      const settings = settingsRows[0]?.payload;
      if (!settings) fail("server_error");
      if (computePhase(settings) !== "submitting" || !settings.uploadsEnabled) fail("submissions_closed");

      const files = await tx<{ id: string; size: number; work_id: string | null; uploaded_at: Date | null; participant_id: string }[]>`
        select id, size, work_id, uploaded_at, participant_id from files where id = any(${fileIds}) for update
      `;
      if (files.length !== fileIds.length) fail("invalid_file");
      for (const f of files) {
        if (f.participant_id !== session.participantId) fail("invalid_file");
        if (f.work_id !== null) fail("invalid_file");
        if (!f.uploaded_at) fail("upload_incomplete");
      }
      const total = files.reduce((s, f) => s + Number(f.size), 0);
      if (total > MAX_TOTAL) fail("total_too_large");

      pending = settings.requireApproval === true;
      await tx`insert into works (id, title, category, tools, description, participant_id, visible, deleted)
                values (${workId}, ${title}, ${category}, ${tools}, ${description}, ${session.participantId}, ${!pending}, false)`;
      await tx`update files set work_id = ${workId} where id = any(${fileIds})`;
      await tx`insert into audit (action, detail) values ('작품 등록', ${title})`;
    });

    return c.json({ ok: true, id: workId, pending }, 201);
  });

  // GET /api/files/{fileId} — 서명 URL 302 리다이렉트 (SSOT 6.3)
  app.get("/api/files/:fileId", async (c) => {
    let session;
    let isAdmin = false;
    try {
      session = await requireAdminSession(c);
      isAdmin = true;
    } catch {
      session = await requireMemberSession(c);
      if (!session.participantId) fail("participant_required");
    }

    const fileId = c.req.param("fileId");
    const sql = getSql();
    const rows = await sql<{ id: string; name: string; work_id: string | null; visible: boolean | null; deleted: boolean | null }[]>`
      select f.id, f.name, f.work_id, w.visible, w.deleted
      from files f left join works w on w.id = f.work_id
      where f.id = ${fileId} and f.uploaded_at is not null
    `;
    const file = rows[0];
    if (!file || !file.work_id) fail("not_found");
    if (!isAdmin && (!file.visible || file.deleted)) fail("not_found");

    const download = c.req.query("download") === "1";
    const url = await createDownloadUrl(fileId, 60, download ? file.name : undefined);
    c.header("Cache-Control", "private, no-store");
    return c.redirect(url, 302);
  });

  // POST /api/works/{workId}/like — 토글 (SSOT 7절)
  app.post("/api/works/:workId/like", async (c) => {
    const session = await requireParticipant(c);
    const workId = c.req.param("workId");
    const sql = getSql();
    const work = await sql<{ id: string }[]>`select id from works where id = ${workId} and visible = true and deleted = false`;
    if (!work[0]) fail("not_found");
    const del = await sql`delete from likes where work_id = ${workId} and participant_id = ${session.participantId} returning work_id`;
    if (del.length === 0) {
      await sql`insert into likes (work_id, participant_id) values (${workId}, ${session.participantId}) on conflict do nothing`;
    }
    return c.json({ ok: true });
  });

  // POST /api/works/{workId}/view — 최초 조회 시에만 views 증가
  app.post("/api/works/:workId/view", async (c) => {
    const session = await requireParticipant(c);
    const workId = c.req.param("workId");
    const sql = getSql();
    const work = await sql<{ id: string }[]>`select id from works where id = ${workId} and visible = true and deleted = false`;
    if (!work[0]) fail("not_found");
    await sql.begin(async (tx) => {
      const inserted = await tx`insert into views (work_id, participant_id) values (${workId}, ${session.participantId})
                                 on conflict do nothing returning work_id`;
      if (inserted.length > 0) {
        await tx`update works set views = views + 1 where id = ${workId}`;
      }
    });
    return c.json({ ok: true });
  });
}

export { isUniqueViolation };
