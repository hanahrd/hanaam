import type { Hono } from "hono";
import { z } from "zod";
import { getSql } from "../db/client";
import { fail, isUniqueViolation } from "../lib/http";
import { newParticipantId } from "../lib/ids";
import { nicknameKey, normalizeNickname, validateNicknameFormat } from "../lib/nickname";
import { formatRecoveryCode, generateRecoveryCode, recoveryDigest, verifyRecoveryCode } from "../lib/recovery";
import { clientIp, enforceRateLimit, hashFingerprint, underRateLimit, recordAttempt } from "../lib/rateLimit";
import { requireMemberSession } from "../auth/middleware";
import { attachParticipant } from "../auth/session";

const nicknameSchema = z.object({ nickname: z.string().min(1).max(40) });
const recoverSchema = z.object({ nickname: z.string().min(1).max(40), recoveryCode: z.string().min(1).max(40) });

export function registerParticipantRoutes(app: Hono) {
  // GET /api/me — 세션의 참여자 정보. participant_id는 노출하지 않는다.
  app.get("/api/me", async (c) => {
    const session = await requireMemberSession(c);
    if (!session.participantId) return c.json({ participant: null, csrf: session.csrf });
    const sql = getSql();
    const rows = await sql<{ nickname: string }[]>`select nickname from participants where id = ${session.participantId}`;
    return c.json({ participant: rows[0] ? { nickname: rows[0].nickname } : null, csrf: session.csrf });
  });

  // GET /api/nickname-check?nickname=... — 참여자 세션 필요, 실시간 중복 확인
  app.get("/api/nickname-check", async (c) => {
    const session = await requireMemberSession(c);
    const fp = session.tokenHash;
    const ok = await underRateLimit(fp, "nickname-check", 60, 15);
    if (!ok) fail("too_many_requests");
    await recordAttempt(fp, "nickname-check");
    const raw = c.req.query("nickname") ?? "";
    const nickname = normalizeNickname(raw);
    const format = validateNicknameFormat(nickname);
    if (!format.ok) return c.json({ available: false, reason: format.reason });
    const sql = getSql();
    const key = nicknameKey(nickname);
    const rows = await sql<{ id: string }[]>`select id from participants where nickname_key = ${key}`;
    if (rows[0]) return c.json({ available: false, reason: "nickname_taken" });
    return c.json({ available: true });
  });

  // POST /api/participants — 신규 닉네임 등록. 닉네임 미설정 세션만.
  app.post("/api/participants", async (c) => {
    const session = await requireMemberSession(c);
    if (session.participantId) fail("already_registered");
    const ip = hashFingerprint(clientIp(c.req.raw.headers));
    await enforceRateLimit(ip, "register", 10, 60);

    const body = nicknameSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) fail("invalid_input");
    const nickname = normalizeNickname(body.data.nickname);
    const format = validateNicknameFormat(nickname);
    if (!format.ok) fail(format.reason);

    const sql = getSql();
    const id = newParticipantId();
    const key = nicknameKey(nickname);
    const code = generateRecoveryCode();
    const digest = recoveryDigest(code);

    try {
      await sql`insert into participants (id, nickname, nickname_key, recovery_digest)
                values (${id}, ${nickname}, ${key}, ${digest})`;
    } catch (err) {
      if (isUniqueViolation(err)) fail("nickname_taken");
      throw err;
    }
    await attachParticipant(session.tokenHash, id);
    await sql`insert into audit (action, detail) values ('닉네임 등록', ${nickname})`;
    return c.json({ ok: true, nickname, recoveryCode: formatRecoveryCode(code) }, 201);
  });

  // POST /api/participants/recover — 복구코드 입장. 닉네임 미설정 세션만.
  app.post("/api/participants/recover", async (c) => {
    const session = await requireMemberSession(c);
    if (session.participantId) fail("already_registered");
    const ip = hashFingerprint(clientIp(c.req.raw.headers));
    await enforceRateLimit(ip, "recover", 10, 15);

    const body = recoverSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) fail("invalid_input");
    const nickname = normalizeNickname(body.data.nickname);
    const key = nicknameKey(nickname);

    const sql = getSql();
    const rows = await sql<{ id: string; nickname: string; recovery_digest: string; status: string }[]>`
      select id, nickname, recovery_digest, status from participants where nickname_key = ${key}
    `;
    const row = rows[0];
    // 닉네임 없음과 코드 불일치를 구분하지 않는다 (SSOT 2.4).
    if (!row || !verifyRecoveryCode(body.data.recoveryCode, row.recovery_digest)) fail("recovery_invalid");
    if (row.status === "blocked") fail("account_blocked");

    await attachParticipant(session.tokenHash, row.id);
    return c.json({ ok: true, nickname: row.nickname });
  });
}
