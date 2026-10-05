import { pbkdf2 as pbkdf2Cb, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2 = promisify(pbkdf2Cb);
const ITERATIONS = 600_000; // SSOT 3절
const KEYLEN = 32;
const DIGEST = "sha256";

export async function hashPassword(password: string): Promise<{ salt: string; digest: string }> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await pbkdf2(password, salt, ITERATIONS, KEYLEN, DIGEST)) as Buffer;
  return { salt, digest: derived.toString("hex") };
}

export async function verifyPassword(password: string, salt: string, digestHex: string): Promise<boolean> {
  const derived = (await pbkdf2(password, salt, ITERATIONS, KEYLEN, DIGEST)) as Buffer;
  const expected = Buffer.from(digestHex, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/** 참여자 공통 비밀번호는 대소문자 무시, 앞뒤 공백 제거. 관리자는 그대로(대소문자 구분). */
export function normalizeMemberPassword(password: string): string {
  return password.trim().toLowerCase();
}

export function normalizeAdminPassword(password: string): string {
  return password.trim();
}
