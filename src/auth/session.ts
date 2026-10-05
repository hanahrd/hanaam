import { createHash, randomBytes } from "node:crypto";
import { getSql } from "../db/client";

export type Role = "member" | "admin";

export interface SessionInfo {
  tokenHash: string;
  role: Role;
  csrf: string;
  participantId: string | null;
  expires: Date;
}

const COOKIE_NAMES: Record<Role, string> = {
  member: "__Host-hana_member",
  admin: "__Host-hana_admin",
};

export function cookieNameFor(role: Role): string {
  return COOKIE_NAMES[role];
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const SESSION_HOURS = 12;

/** 세션 발급. participant_id는 닉네임 미설정이면 NULL (SSOT 2.1). */
export async function createSession(role: Role, participantId: string | null = null) {
  const sql = getSql();
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const csrf = randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + SESSION_HOURS * 3600_000);
  await sql`insert into sessions (token_hash, role, csrf, expires, participant_id)
            values (${tokenHash}, ${role}, ${csrf}, ${expires}, ${participantId})`;
  return { token, tokenHash, csrf, expires };
}

export async function getSession(role: Role, token: string | undefined): Promise<SessionInfo | null> {
  if (!token) return null;
  const sql = getSql();
  const tokenHash = hashToken(token);
  const rows = await sql<{ token_hash: string; role: Role; csrf: string; participant_id: string | null; expires: Date }[]>`
    select token_hash, role, csrf, participant_id, expires from sessions
    where token_hash = ${tokenHash} and role = ${role} and expires > now()
  `;
  const row = rows[0];
  if (!row) return null;
  return { tokenHash: row.token_hash, role: row.role, csrf: row.csrf, participantId: row.participant_id, expires: row.expires };
}

export async function attachParticipant(tokenHash: string, participantId: string): Promise<void> {
  const sql = getSql();
  await sql`update sessions set participant_id = ${participantId} where token_hash = ${tokenHash}`;
}

export async function destroySession(tokenHash: string): Promise<void> {
  const sql = getSql();
  await sql`delete from sessions where token_hash = ${tokenHash}`;
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

/** __Host- 접두 쿠키. Domain 없음, HttpOnly·Secure·SameSite=Lax (SSOT 9.2). */
export function setCookieHeader(role: Role, token: string, maxAgeSeconds = SESSION_HOURS * 3600): string {
  return `${cookieNameFor(role)}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function clearCookieHeader(role: Role): string {
  return `${cookieNameFor(role)}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}
