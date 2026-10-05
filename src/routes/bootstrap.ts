import type { Hono } from "hono";
import { getSql } from "../db/client.js";
import { computePhase, toKstIso } from "../lib/phase.js";
import { requireAdminSession, requireMemberSession } from "../auth/middleware.js";
import { fail } from "../lib/http.js";

const MAX_FILE = 50 * 1024 * 1024;
const MAX_TOTAL = 100 * 1024 * 1024;
const MAX_FILES = 5;

interface FileRow {
  id: string;
  name: string;
  mime: string;
  size: number;
  work_id: string;
}

interface SettingsRow {
  version: number;
  payload: Record<string, unknown>;
}

async function loadSettings() {
  const sql = getSql();
  const rows = await sql<{ payload: Record<string, unknown> }[]>`select payload from settings where id = 1`;
  const payload = rows[0]?.payload;
  if (!payload) fail("server_error");
  return payload as SettingsRow["payload"] & {
    submissionDeadline: string;
    voteStart: string;
    voteEnd: string;
    voteCount: number;
    uploadsEnabled: boolean;
    version: number;
  };
}

interface WorkRow {
  id: string;
  title: string;
  category: string;
  tools: string;
  description: string;
  participant_id: string;
  visible: boolean;
  deleted: boolean;
  created: Date;
  views: number;
  nickname: string;
  likes: string;
  votes: string;
  liked: boolean;
}

export function registerBootstrapRoutes(app: Hono) {
  // GET /api/bootstrap — 닉네임 설정됨 (SSOT 11.1)
  app.get("/api/bootstrap", async (c) => {
    const session = await requireMemberSession(c);
    if (!session.participantId) fail("participant_required");
    const sql = getSql();

    const settings = await loadSettings();
    const phase = computePhase(settings);

    const files = await sql<FileRow[]>`
      select id, name, mime, size, work_id from files where work_id is not null and uploaded_at is not null
    `;
    const filesByWork = new Map<string, FileRow[]>();
    for (const f of files) {
      const list = filesByWork.get(f.work_id) ?? [];
      list.push(f);
      filesByWork.set(f.work_id, list);
    }

    const rows = await sql<WorkRow[]>`
      select w.id, w.title, w.category, w.tools, w.description, w.participant_id, w.visible, w.deleted,
             w.created, w.views, p.nickname,
             (select count(*) from likes l where l.work_id = w.id)::text as likes,
             (select count(*) from ballot_choices bc where bc.work_id = w.id)::text as votes,
             exists(select 1 from likes l2 where l2.work_id = w.id and l2.participant_id = ${session.participantId}) as liked
      from works w
      join participants p on p.id = w.participant_id
      where w.deleted = false and w.visible = true
      order by w.created desc
    `;

    const votedRows = await sql<{ exists: boolean }[]>`select exists(select 1 from ballots where participant_id = ${session.participantId}) as exists`;

    const works = rows.map((w) => ({
      id: w.id,
      title: w.title,
      category: w.category,
      tools: w.tools,
      description: w.description,
      nickname: w.nickname,
      mine: w.participant_id === session.participantId,
      created: toKstIso(w.created),
      views: w.views,
      likes: Number(w.likes),
      liked: w.liked,
      files: (filesByWork.get(w.id) ?? []).map((f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size })),
    }));

    return c.json({
      settings: { ...settings, submissionDeadline: toKstIso(settings.submissionDeadline), voteStart: toKstIso(settings.voteStart), voteEnd: toKstIso(settings.voteEnd) },
      phase,
      serverNow: toKstIso(new Date()),
      csrf: session.csrf,
      works,
      voted: votedRows[0]?.exists ?? false,
      limits: { maxFile: MAX_FILE, maxTotal: MAX_TOTAL, maxFiles: MAX_FILES },
    });
  });

  // GET /api/admin/bootstrap
  app.get("/api/admin/bootstrap", async (c) => {
    const session = await requireAdminSession(c);
    const sql = getSql();
    const settings = await loadSettings();
    const phase = computePhase(settings);

    const files = await sql<FileRow[]>`
      select id, name, mime, size, work_id from files where work_id is not null and uploaded_at is not null
    `;
    const filesByWork = new Map<string, FileRow[]>();
    for (const f of files) {
      const list = filesByWork.get(f.work_id) ?? [];
      list.push(f);
      filesByWork.set(f.work_id, list);
    }

    const rows = await sql<WorkRow[]>`
      select w.id, w.title, w.category, w.tools, w.description, w.participant_id, w.visible, w.deleted,
             w.created, w.views, p.nickname,
             (select count(*) from likes l where l.work_id = w.id)::text as likes,
             (select count(*) from ballot_choices bc where bc.work_id = w.id)::text as votes
      from works w
      join participants p on p.id = w.participant_id
      where w.deleted = false
      order by w.created desc
    `;

    const works = rows.map((w) => ({
      id: w.id,
      title: w.title,
      category: w.category,
      tools: w.tools,
      description: w.description,
      nickname: w.nickname,
      visible: w.visible,
      created: toKstIso(w.created),
      views: w.views,
      likes: Number(w.likes),
      votes: Number(w.votes),
      files: (filesByWork.get(w.id) ?? []).map((f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size })),
    }));

    const ballots = await sql<{ id: string; nickname: string; created: Date }[]>`
      select b.id, p.nickname, b.created from ballots b join participants p on p.id = b.participant_id order by b.created desc
    `;

    const participants = await sql<
      {
        id: string;
        nickname: string;
        created: Date;
        uploads: string;
        voted: boolean;
        votedAt: Date | null;
        status: string;
      }[]
    >`
      select p.id, p.nickname, p.created,
             (select count(*) from works w where w.participant_id = p.id and w.deleted = false)::text as uploads,
             exists(select 1 from ballots b where b.participant_id = p.id) as voted,
             (select b.created from ballots b where b.participant_id = p.id) as "votedAt",
             p.status
      from participants p
      order by p.created desc
    `;

    const audit = await sql<{ action: string; detail: string; created: Date }[]>`
      select action, detail, created from audit order by created desc limit 50
    `;

    return c.json({
      settings: { ...settings, submissionDeadline: toKstIso(settings.submissionDeadline), voteStart: toKstIso(settings.voteStart), voteEnd: toKstIso(settings.voteEnd) },
      phase,
      serverNow: toKstIso(new Date()),
      csrf: session.csrf,
      works,
      ballots: ballots.map((b) => ({ id: b.id, nickname: b.nickname, created: toKstIso(b.created) })),
      participants: participants.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        created: toKstIso(p.created),
        uploads: Number(p.uploads),
        voted: p.voted,
        votedAt: p.votedAt ? toKstIso(p.votedAt) : null,
        status: p.status,
      })),
      audit: audit.map((a) => ({ action: a.action, detail: a.detail, created: toKstIso(a.created) })),
    });
  });
}
