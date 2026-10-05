export type Phase = "submitting" | "waiting" | "voting" | "ended";

export interface ScheduleSettings {
  submissionDeadline: string;
  voteStart: string;
  voteEnd: string;
}

/** SSOT 5절 — 접수·투표 상태 판정. 서버가 최종 판정한다. */
export function computePhase(settings: ScheduleSettings, now: Date = new Date()): Phase {
  const n = now.getTime();
  const sub = Date.parse(settings.submissionDeadline);
  const start = Date.parse(settings.voteStart);
  const end = Date.parse(settings.voteEnd);
  if (n >= start && n < end) return "voting";
  if (n >= end) return "ended";
  if (n < sub) return "submitting";
  return "waiting";
}

/** DB timestamptz → KST ISO 8601(+09:00, 초 단위) 문자열로 직렬화. */
export function toKstIso(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const kst = new Date(d.getTime() + 9 * 3600000);
  const iso = kst.toISOString(); // ...sssZ
  return iso.slice(0, 19) + "+09:00";
}

export function isValidIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
