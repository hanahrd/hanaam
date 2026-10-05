import { readFileSync } from "node:fs";
import path from "node:path";

// SSOT 2.3 — 예약어 (키에 포함되면 불가)
const RESERVED = ["관리자", "운영", "admin", "administrator", "하나증권", "인재개발", "system"];

let bannedCache: string[] | null = null;

function loadBanned(): string[] {
  if (bannedCache) return bannedCache;
  try {
    const file = readFileSync(path.join(process.cwd(), "server", "banned_nicknames.txt"), "utf8");
    bannedCache = file
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("#"));
  } catch {
    bannedCache = [];
  }
  return bannedCache;
}

/** 앞뒤 공백 제거 → NFKC. 저장용 표시 닉네임. */
export function normalizeNickname(raw: string): string {
  return raw.trim().normalize("NFKC");
}

/** 중복 판정 키: NFKC → toLocaleLowerCase('en-US') → '_' 제거 (SSOT 2.3). */
export function nicknameKey(nickname: string): string {
  return nickname.normalize("NFKC").toLocaleLowerCase("en-US").replace(/_/g, "");
}

export type NicknameCheckResult = { ok: true } | { ok: false; reason: "nickname_invalid" | "nickname_reserved" };

/** 길이·문자·사번형태·예약어·금칙어 검사. DB UNIQUE는 호출부에서 별도 처리한다. */
export function validateNicknameFormat(nickname: string): NicknameCheckResult {
  if (nickname.length < 2 || nickname.length > 12) return { ok: false, reason: "nickname_invalid" };
  // 허용: 한글 완성형, 영문, 숫자, 밑줄. 자모 단독(호환 자모/현대 자모)은 불가.
  if (!/^[A-Za-z0-9_가-힣]+$/u.test(nickname)) return { ok: false, reason: "nickname_invalid" };
  if (/[\u1100-\u11ff\u3130-\u318f]/.test(nickname)) return { ok: false, reason: "nickname_invalid" };

  const key = nicknameKey(nickname);
  if (/^\d+$/.test(key)) return { ok: false, reason: "nickname_invalid" };
  if (/^[a-z]{0,2}\d{4,}$/.test(key)) return { ok: false, reason: "nickname_invalid" };

  const keyLower = key.toLowerCase();
  if (RESERVED.some((w) => keyLower.includes(w.normalize("NFKC").toLocaleLowerCase("en-US")))) {
    return { ok: false, reason: "nickname_reserved" };
  }
  if (loadBanned().some((w) => keyLower.includes(w.normalize("NFKC").toLocaleLowerCase("en-US")))) {
    return { ok: false, reason: "nickname_reserved" };
  }
  return { ok: true };
}
