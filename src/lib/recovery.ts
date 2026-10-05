import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

// Crockford Base32 (I, L, O, U 제외) — SSOT 2.4
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 12자리 복구코드를 생성한다 (약 60비트). */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(8);
  let bits = 0n;
  for (const b of bytes) bits = (bits << 8n) | BigInt(b);
  let out = "";
  for (let i = 0; i < 12; i++) {
    out = ALPHABET[Number(bits & 31n)] + out;
    bits >>= 5n;
  }
  return out;
}

/** 화면 표시용 XXXX-XXXX-XXXX 포맷. */
export function formatRecoveryCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

/** 대문자·하이픈/공백 제거 정규화. */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** HMAC-SHA256(RECOVERY_PEPPER, code) — 평문 저장·로깅 금지. */
export function recoveryDigest(code: string): string {
  return createHmac("sha256", env().RECOVERY_PEPPER).update(normalizeRecoveryCode(code)).digest("hex");
}

export function verifyRecoveryCode(code: string, digestHex: string): boolean {
  try {
    const expected = Buffer.from(recoveryDigest(code), "hex");
    const actual = Buffer.from(digestHex, "hex");
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
