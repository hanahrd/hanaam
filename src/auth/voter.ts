import { createHash, randomBytes } from "node:crypto";
import { parseCookies } from "./session.js";

/**
 * 투표자(일반사용자)는 로그인하지 않는다. 쿠키에 담긴 무작위 토큰의 해시로만
 * "같은 브라우저" 여부를 판정한다 — 실명·계정과 연결되지 않는 가장 약한 수준의
 * 중복 방지이며, 쿠키 삭제·다른 기기에서는 재투표를 막지 못한다 (의도된 제한, 추후 재검토).
 */
const VOTER_COOKIE = "__Host-hana_voter";
const VOTER_COOKIE_MAX_AGE = 400 * 24 * 3600; // 브라우저가 허용하는 쿠키 보존 상한에 맞춤

export function newVoterToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashVoterToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function getVoterToken(cookieHeader: string | null): string | undefined {
  return parseCookies(cookieHeader)[VOTER_COOKIE];
}

export function voterCookieHeader(token: string): string {
  return `${VOTER_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${VOTER_COOKIE_MAX_AGE}`;
}
