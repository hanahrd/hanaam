import { createHash } from "node:crypto";
import { getSql } from "../db/client";

/** Vercel이 덮어쓰는 클라이언트 IP 헤더만 신뢰한다 (SSOT 9.2). */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export function hashFingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** 지정한 시간창(분) 내 시도 횟수가 한도보다 적은지 확인한다. */
export async function underRateLimit(fingerprint: string, bucket: string, limit: number, windowMinutes: number): Promise<boolean> {
  const sql = getSql();
  const cutoff = new Date(Date.now() - windowMinutes * 60_000);
  const rows = await sql<{ count: string }[]>`
    select count(*)::text as count from attempts
    where fingerprint = ${fingerprint} and bucket = ${bucket} and created > ${cutoff}
  `;
  return Number(rows[0]?.count ?? 0) < limit;
}

export async function recordAttempt(fingerprint: string, bucket: string): Promise<void> {
  const sql = getSql();
  await sql`insert into attempts (fingerprint, bucket) values (${fingerprint}, ${bucket})`;
}

/** 한도를 넘으면 too_many_requests, 아니면 시도를 기록한다. */
export async function enforceRateLimit(fingerprint: string, bucket: string, limit: number, windowMinutes: number): Promise<void> {
  const ok = await underRateLimit(fingerprint, bucket, limit, windowMinutes);
  if (!ok) {
    const { fail } = await import("./http");
    fail("too_many_requests");
  }
  await recordAttempt(fingerprint, bucket);
}
