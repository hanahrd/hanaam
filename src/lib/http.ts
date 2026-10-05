// 공통 에러 코드 ↔ HTTP 상태 매핑 (SSOT 12절)
export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, status?: number) {
    super(code);
    this.code = code;
    this.status = status ?? ERROR_STATUS[code] ?? 400;
  }
}

export const ERROR_STATUS: Record<string, number> = {
  wrong_password: 401,
  unauthorized: 401,
  csrf_denied: 403,
  origin_denied: 403,
  participant_required: 403,
  account_blocked: 403,
  invalid_input: 400,
  nickname_invalid: 400,
  nickname_reserved: 400,
  nickname_taken: 409,
  recovery_invalid: 401,
  already_registered: 409,
  invalid_dates: 400,
  date_order: 400,
  invalid_count: 400,
  selection_count: 400,
  invalid_selection: 400,
  self_vote: 400,
  consent_required: 400,
  submissions_closed: 409,
  voting_closed: 409,
  already_voted: 409,
  rules_locked: 409,
  works_locked: 409,
  end_extend_only: 409,
  settings_conflict: 409,
  not_enough_works: 400,
  file_required: 400,
  invalid_file: 400,
  invalid_file_content: 400,
  upload_incomplete: 400,
  file_too_large: 413,
  total_too_large: 400,
  too_many_requests: 429,
  not_found: 404,
  server_error: 500,
};

export function fail(code: string): never {
  throw new ApiError(code);
}

/** Postgres UNIQUE 위반(23505)을 제약 이름으로 구분해 공개 에러 코드로 바꾼다. */
export function failFromConstraint(constraintName: string | undefined): never {
  if (constraintName === "participants_nickname_key_uq") fail("nickname_taken");
  if (constraintName === "ballots_participant_uq") fail("already_voted");
  fail("server_error");
}

export function isUniqueViolation(err: unknown): err is { code: "23505"; constraint_name?: string } {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}
