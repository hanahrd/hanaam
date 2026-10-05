import type { Hono } from "hono";
import { z } from "zod";
import { getSql } from "../db/client";
import { fail, isUniqueViolation } from "../lib/http";
import { computePhase, isValidIsoDate, toKstIso } from "../lib/phase";
import { toCsv } from "../lib/csv";
import { nicknameKey, normalizeNickname, validateNicknameFormat } from "../lib/nickname";
import { formatRecoveryCode, generateRecoveryCode, recoveryDigest } from "../lib/recovery";
import { hashPassword, normalizeAdminPassword, normalizeMemberPassword, verifyPassword } from "../lib/password";
import { enforceRateLimit } from "../lib/rateLimit";
import { requireAdminSession } from "../auth/middleware";

interface SettingsPayload {
  [key: string]: unknown;
  siteName: string;
  welcome: string;
  description: string;
  notice: string;
  uploadGuide: string;
  submissionDeadline: string;
  voteStart: string;
  voteEnd: string;
  voteCount: number;
  uploadsEnabled: boolean;
  requireApproval: boolean;
  version: number;
  storyEnabled: boolean;
  storyTitle1: string;
  storyTitle2: string;
  storyTitle3: string;
  storyCaption1: string;
  storyCaption2: string;
  storyCaption3: string;
}

const settingsPatchSchema = z
  .object({
    version: z.number().int(),
    siteName: z.string().min(1).max(180).optional(),
    welcome: z.string().min(1).max(180).optional(),
    description: z.string().max(180).optional(),
    notice: z.string().max(500).optional(),
    uploadGuide: z.string().max(500).optional(),
    submissionDeadline: z.string().optional(),
    voteStart: z.string().optional(),
    voteEnd: z.string().optional(),
    voteCount: z.number().int().min(1).max(20).optional(),
    uploadsEnabled: z.boolean().optional(),
    requireApproval: z.boolean().optional(),
    storyEnabled: z.boolean().optional(),
    storyTitle1: z.string().min(1).max(140).optional(),
    storyTitle2: z.string().min(1).max(140).optional(),
    storyTitle3: z.string().min(1).max(140).optional(),
    storyCaption1: z.string().max(180).optional(),
    storyCaption2: z.string().max(180).optional(),
    storyCaption3: z.string().max(180).optional(),
  })
  .passthrough();

const workActionSchema = z.object({ action: z.enum(["show", "hide", "delete"]) });
const participantActionSchema = z.object({
  action: z.enum(["rename", "reset_recovery", "block", "unblock"]),
  nickname: z.string().min(1).max(40).optional(),
});
const passwordSchema = z.object({
  role: z.enum(["member", "admin"]),
  currentAdminPassword: z.string().min(1),
  newPassword: z.string().min(10).max(128),
});

export function registerAdminRoutes(app: Hono) {
  // PATCH /api/admin/settings — settings FOR UPDATE, ballots 존재 확인 (SSOT 7.2, 10.5)
  app.patch("/api/admin/settings", async (c) => {
    await requireAdminSession(c);
    const body = settingsPatchSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) fail("invalid_input");
    const patch = body.data;

    const sql = getSql();
    let result: SettingsPayload | null = null;

    await sql.begin(async (tx) => {
      const rows = await tx<{ payload: SettingsPayload }[]>`select payload from settings where id = 1 for update`;
      const old = rows[0]?.payload;
      if (!old) fail("server_error");
      if (patch.version !== old.version) fail("settings_conflict");

      const ballotCountRows = await tx<{ count: string }[]>`select count(*)::text as count from ballots`;
      const hasBallots = Number(ballotCountRows[0]?.count ?? 0) > 0;

      const next: SettingsPayload = { ...old, ...patch, version: old.version + 1 };

      if (hasBallots) {
        if (["submissionDeadline", "voteStart", "voteCount"].some((k) => (patch as Record<string, unknown>)[k] !== undefined && (patch as Record<string, unknown>)[k] !== (old as Record<string, unknown>)[k])) {
          fail("rules_locked");
        }
        if (patch.voteEnd && Date.parse(patch.voteEnd) < Date.parse(old.voteEnd)) fail("end_extend_only");
      }

      for (const key of ["submissionDeadline", "voteStart", "voteEnd"] as const) {
        if (!isValidIsoDate(next[key])) fail("invalid_dates");
      }
      if (!(Date.parse(next.submissionDeadline) <= Date.parse(next.voteStart) && Date.parse(next.voteStart) < Date.parse(next.voteEnd))) {
        fail("date_order");
      }
      if (!Number.isInteger(next.voteCount) || next.voteCount < 1 || next.voteCount > 20) fail("invalid_count");

      if (computePhase(next) === "voting") {
        const visibleCount = await tx<{ count: string }[]>`select count(*)::text as count from works where visible = true and deleted = false`;
        if (Number(visibleCount[0]?.count ?? 0) < next.voteCount) fail("not_enough_works");
      }

      await tx`update settings set payload = ${JSON.stringify(next)}::jsonb where id = 1`;
      await tx`insert into audit (action, detail) values ('운영 설정 변경', '일정 또는 페이지 문구 수정')`;
      result = next;
    });

    if (!result) fail("server_error");
    const r = result as SettingsPayload;
    return c.json({
      ok: true,
      settings: { ...r, submissionDeadline: toKstIso(r.submissionDeadline), voteStart: toKstIso(r.voteStart), voteEnd: toKstIso(r.voteEnd) },
    });
  });

  // PATCH /api/admin/works/{workId} — show/hide/delete (SSOT 7.3)
  app.patch("/api/admin/works/:workId", async (c) => {
    await requireAdminSession(c);
    const workId = c.req.param("workId");
    const body = workActionSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) fail("invalid_input");

    const sql = getSql();
    await sql.begin(async (tx) => {
      const settingsRows = await tx<{ payload: { submissionDeadline: string; voteStart: string; voteEnd: string } }[]>`
        select payload from settings where id = 1 for share
      `;
      const settings = settingsRows[0]?.payload;
      if (!settings) fail("server_error");
      const ballotCountRows = await tx<{ count: string }[]>`select count(*)::text as count from ballots`;
      const hasBallots = Number(ballotCountRows[0]?.count ?? 0) > 0;
      if (hasBallots || computePhase(settings) === "voting") fail("works_locked");

      const workRows = await tx<{ id: string; title: string }[]>`select id, title from works where id = ${workId} and deleted = false for update`;
      const work = workRows[0];
      if (!work) fail("not_found");

      if (body.data.action === "delete") {
        await tx`update works set deleted = true, visible = false where id = ${workId}`;
      } else {
        await tx`update works set visible = ${body.data.action === "show"} where id = ${workId}`;
      }
      await tx`insert into audit (action, detail) values ('작품 관리', ${work.title + " / " + body.data.action})`;
    });

    return c.json({ ok: true });
  });

  // PATCH /api/admin/participants/{participantId}
  app.patch("/api/admin/participants/:participantId", async (c) => {
    await requireAdminSession(c);
    const participantId = c.req.param("participantId");
    const body = participantActionSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) fail("invalid_input");
    const sql = getSql();

    const rows = await sql<{ id: string; nickname: string; status: string }[]>`select id, nickname, status from participants where id = ${participantId}`;
    const participant = rows[0];
    if (!participant) fail("not_found");

    if (body.data.action === "rename") {
      if (!body.data.nickname) fail("invalid_input");
      const nickname = normalizeNickname(body.data.nickname);
      const format = validateNicknameFormat(nickname);
      if (!format.ok) fail(format.reason);
      const key = nicknameKey(nickname);
      try {
        await sql`update participants set nickname = ${nickname}, nickname_key = ${key} where id = ${participantId}`;
      } catch (err) {
        if (isUniqueViolation(err)) fail("nickname_taken");
        throw err;
      }
      await sql`insert into audit (action, detail) values ('닉네임 변경', ${participant.nickname + " → " + nickname})`;
      return c.json({ ok: true });
    }

    if (body.data.action === "reset_recovery") {
      const code = generateRecoveryCode();
      const digest = recoveryDigest(code);
      await sql`update participants set recovery_digest = ${digest} where id = ${participantId}`;
      await sql`insert into audit (action, detail) values ('복구코드 재발급', ${participant.nickname})`;
      return c.json({ ok: true, recoveryCode: formatRecoveryCode(code) });
    }

    if (body.data.action === "block") {
      await sql`update participants set status = 'blocked' where id = ${participantId}`;
      await sql`insert into audit (action, detail) values ('계정 차단', ${participant.nickname})`;
      return c.json({ ok: true });
    }

    // unblock
    await sql`update participants set status = 'active' where id = ${participantId}`;
    await sql`insert into audit (action, detail) values ('계정 차단 해제', ${participant.nickname})`;
    return c.json({ ok: true });
  });

  // POST /api/admin/password
  app.post("/api/admin/password", async (c) => {
    const session = await requireAdminSession(c);
    await enforceRateLimit(session.tokenHash, "admin-password", 10, 15);
    const body = passwordSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) fail("invalid_input");

    const sql = getSql();
    const rows = await sql<{ salt: string; digest: string }[]>`select salt, digest from credentials where role = 'admin'`;
    const cred = rows[0];
    if (!cred) fail("server_error");
    const ok = await verifyPassword(normalizeAdminPassword(body.data.currentAdminPassword), cred.salt, cred.digest);
    if (!ok) fail("wrong_password");

    const normalized = body.data.role === "member" ? normalizeMemberPassword(body.data.newPassword) : normalizeAdminPassword(body.data.newPassword);
    const { salt, digest } = await hashPassword(normalized);
    await sql`update credentials set salt = ${salt}, digest = ${digest} where role = ${body.data.role}`;
    if (body.data.role === "member") {
      await sql`delete from sessions where role = 'member'`;
    } else {
      await sql`delete from sessions where role = 'admin' and token_hash != ${session.tokenHash}`;
    }
    await sql`insert into audit (action, detail) values ('접속 비밀번호 변경', ${body.data.role})`;
    return c.json({ ok: true });
  });

  // GET /api/admin/export/participants — CSV (SSOT 8절)
  app.get("/api/admin/export/participants", async (c) => {
    await requireAdminSession(c);
    const sql = getSql();
    const rows = await sql<
      { nickname: string; created: Date; uploads: string; voted: boolean; votedAt: Date | null; status: string }[]
    >`
      select p.nickname, p.created,
             (select count(*) from works w where w.participant_id = p.id and w.deleted = false)::text as uploads,
             exists(select 1 from ballots b where b.participant_id = p.id) as voted,
             (select b.created from ballots b where b.participant_id = p.id) as "votedAt",
             p.status
      from participants p order by p.created desc
    `;
    const header = ["닉네임", "가입일시(KST)", "제출 수", "투표 여부", "투표일시(KST)", "상태"];
    const body = rows.map((r) => [r.nickname, toKstIso(r.created), r.uploads, r.voted ? "완료" : "미참여", r.votedAt ? toKstIso(r.votedAt) : "", r.status]);
    const csv = toCsv([header, ...body]);
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", 'attachment; filename="participants.csv"');
    return c.body(csv);
  });

  // GET /api/admin/export/results — CSV
  app.get("/api/admin/export/results", async (c) => {
    await requireAdminSession(c);
    const sql = getSql();
    const rows = await sql<{ title: string; nickname: string; category: string; likes: string; votes: string }[]>`
      select w.title, p.nickname, w.category,
             (select count(*) from likes l where l.work_id = w.id)::text as likes,
             (select count(*) from ballot_choices bc where bc.work_id = w.id)::text as votes
      from works w join participants p on p.id = w.participant_id
      where w.deleted = false
      order by votes::int desc
    `;
    const header = ["작품명", "제작자(닉네임)", "유형", "좋아요", "득표수"];
    const body = rows.map((r) => [r.title, r.nickname, r.category, r.likes, r.votes]);
    const csv = toCsv([header, ...body]);
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", 'attachment; filename="results.csv"');
    return c.body(csv);
  });
}
