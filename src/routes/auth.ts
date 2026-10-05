import type { Hono } from "hono";
import { z } from "zod";
import { getSql } from "../db/client.js";
import { fail } from "../lib/http.js";
import { normalizeAdminPassword, verifyPassword } from "../lib/password.js";
import { nicknameKey, normalizeNickname } from "../lib/nickname.js";
import { clientIp, enforceRateLimit, hashFingerprint } from "../lib/rateLimit.js";
import { checkOrigin, checkCsrf, readSessionToken } from "../auth/middleware.js";
import { clearCookieHeader, createSession, destroySession, getSession, setCookieHeader } from "../auth/session.js";

const memberLoginSchema = z.object({ nickname: z.string().min(1).max(40), password: z.string().min(1).max(200) });
const adminLoginSchema = z.object({ password: z.string().min(1).max(200) });

export function registerAuthRoutes(app: Hono) {
  // POST /api/login — 제작자(업로더) 개별 계정. 관리자가 미리 만든 닉네임+비밀번호로 로그인한다.
  app.post("/api/login", async (c) => {
    checkOrigin(c);
    const fp = hashFingerprint(clientIp(c.req.raw.headers));
    await enforceRateLimit(fp, "login:member", 15, 15);
    const body = memberLoginSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) fail("invalid_input");
    const key = nicknameKey(normalizeNickname(body.data.nickname));
    const sql = getSql();
    const rows = await sql<{ id: string; nickname: string; password_salt: string; password_digest: string; status: string }[]>`
      select id, nickname, password_salt, password_digest, status from participants where nickname_key = ${key}
    `;
    const participant = rows[0];
    // 닉네임 없음과 비밀번호 불일치를 구분하지 않는다.
    if (!participant) fail("wrong_password");
    const ok = await verifyPassword(body.data.password.trim(), participant.password_salt, participant.password_digest);
    if (!ok) fail("wrong_password");
    if (participant.status === "blocked") fail("account_blocked");
    const { token, csrf } = await createSession("member", participant.id);
    c.header("Set-Cookie", setCookieHeader("member", token), { append: true });
    return c.json({ ok: true, nickname: participant.nickname, csrf });
  });

  // POST /api/admin/login — 관리자 비밀번호 (대소문자 구분)
  app.post("/api/admin/login", async (c) => {
    checkOrigin(c);
    const fp = hashFingerprint(clientIp(c.req.raw.headers));
    await enforceRateLimit(fp, "login:admin", 15, 15);
    const body = adminLoginSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) fail("invalid_input");
    const sql = getSql();
    const rows = await sql<{ salt: string; digest: string }[]>`select salt, digest from credentials where role = 'admin'`;
    const cred = rows[0];
    if (!cred) fail("wrong_password");
    const ok = await verifyPassword(normalizeAdminPassword(body.data.password), cred.salt, cred.digest);
    if (!ok) fail("wrong_password");
    const { token, csrf } = await createSession("admin", null);
    c.header("Set-Cookie", setCookieHeader("admin", token), { append: true });
    return c.json({ ok: true, csrf });
  });

  app.post("/api/logout", async (c) => {
    checkOrigin(c);
    const token = readSessionToken(c, "member");
    const session = await getSession("member", token);
    if (session) {
      checkCsrf(c, session.csrf);
      await destroySession(session.tokenHash);
    }
    c.header("Set-Cookie", clearCookieHeader("member"), { append: true });
    return c.json({ ok: true });
  });

  app.post("/api/admin/logout", async (c) => {
    checkOrigin(c);
    const token = readSessionToken(c, "admin");
    const session = await getSession("admin", token);
    if (session) {
      checkCsrf(c, session.csrf);
      await destroySession(session.tokenHash);
    }
    c.header("Set-Cookie", clearCookieHeader("admin"), { append: true });
    return c.json({ ok: true });
  });
}
