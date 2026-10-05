import type { Hono } from "hono";
import { z } from "zod";
import { getSql } from "../db/client";
import { fail } from "../lib/http";
import { normalizeAdminPassword, normalizeMemberPassword, verifyPassword } from "../lib/password";
import { clientIp, enforceRateLimit, hashFingerprint } from "../lib/rateLimit";
import { checkOrigin, checkCsrf, readSessionToken } from "../auth/middleware";
import { clearCookieHeader, createSession, destroySession, getSession, setCookieHeader } from "../auth/session";

const loginSchema = z.object({ password: z.string().min(1).max(200) });

export function registerAuthRoutes(app: Hono) {
  // POST /api/login — 참여자 공통 비밀번호 (대소문자 무시, 공백 제거)
  app.post("/api/login", async (c) => {
    checkOrigin(c);
    const fp = hashFingerprint(clientIp(c.req.raw.headers));
    await enforceRateLimit(fp, "login:member", 15, 15);
    const body = loginSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) fail("invalid_input");
    const sql = getSql();
    const rows = await sql<{ salt: string; digest: string }[]>`select salt, digest from credentials where role = 'member'`;
    const cred = rows[0];
    if (!cred) fail("wrong_password");
    const ok = await verifyPassword(normalizeMemberPassword(body.data.password), cred.salt, cred.digest);
    if (!ok) fail("wrong_password");
    const { token, csrf } = await createSession("member", null);
    c.header("Set-Cookie", setCookieHeader("member", token), { append: true });
    return c.json({ ok: true, csrf });
  });

  // POST /api/admin/login — 관리자 비밀번호 (대소문자 구분)
  app.post("/api/admin/login", async (c) => {
    checkOrigin(c);
    const fp = hashFingerprint(clientIp(c.req.raw.headers));
    await enforceRateLimit(fp, "login:admin", 15, 15);
    const body = loginSchema.safeParse(await c.req.json().catch(() => ({})));
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
