import type { Context } from "hono";
import { allowedOrigins } from "../lib/env";
import { fail } from "../lib/http";
import { getSql } from "../db/client";
import { cookieNameFor, getSession, parseCookies, type Role, type SessionInfo } from "./session";

const MUTATING_METHODS = new Set(["POST", "PATCH", "DELETE", "PUT"]);

/** Origin이 ALLOWED_ORIGINS와 일치하는지 확인한다. 변경 요청에만 적용 (SSOT 9.2). */
export function checkOrigin(c: Context): void {
  if (!MUTATING_METHODS.has(c.req.method)) return;
  const origin = c.req.header("origin");
  if (!origin) return; // SameSite=Lax 쿠키가 보조 방어 역할을 한다.
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    fail("origin_denied");
  }
  if (!allowedOrigins().includes(host)) fail("origin_denied");
}

function readSessionToken(c: Context, role: Role): string | undefined {
  const cookies = parseCookies(c.req.header("cookie") ?? null);
  return cookies[cookieNameFor(role)];
}

export function checkCsrf(c: Context, csrfFromSession: string): void {
  if (!MUTATING_METHODS.has(c.req.method)) return;
  const header = c.req.header("x-csrf-token");
  if (!header || header !== csrfFromSession) fail("csrf_denied");
}

/** 참여자 세션(닉네임 미설정 포함)이 있어야 호출 가능한 API에서 사용. */
export async function requireMemberSession(c: Context): Promise<SessionInfo> {
  checkOrigin(c);
  const token = readSessionToken(c, "member");
  const session = await getSession("member", token);
  if (!session) fail("unauthorized");
  checkCsrf(c, session.csrf);
  return session;
}

/** 닉네임 설정 완료 + 차단되지 않은 계정만 통과 (SSOT 2.2, 3절). */
export async function requireParticipant(c: Context): Promise<SessionInfo & { participantId: string }> {
  const session = await requireMemberSession(c);
  if (!session.participantId) fail("participant_required");
  const sql = getSql();
  const rows = await sql<{ status: string }[]>`select status from participants where id = ${session.participantId}`;
  const row = rows[0];
  if (!row) fail("participant_required");
  if (row.status === "blocked") fail("account_blocked");
  return session as SessionInfo & { participantId: string };
}

export async function requireAdminSession(c: Context): Promise<SessionInfo> {
  checkOrigin(c);
  const token = readSessionToken(c, "admin");
  const session = await getSession("admin", token);
  if (!session) fail("unauthorized");
  checkCsrf(c, session.csrf);
  return session;
}

export { readSessionToken };
