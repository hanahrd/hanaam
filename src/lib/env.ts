import { z } from "zod";

// SSOT 14.2 — 서버 전용 환경변수. 브라우저 노출 접두사(NEXT_PUBLIC_ 등)를 쓰지 않는다.
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL 필요"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  MEMBER_PASSWORD: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  RECOVERY_PEPPER: z.string().min(16, "RECOVERY_PEPPER는 32바이트 이상 권장"),
  CRON_SECRET: z.string().min(1),
  ALLOWED_ORIGINS: z.string().min(1),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** 환경변수를 1회 검증해 캐시한다. 실패 시 서버가 기동되지 않는다(SSOT 9.1). */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("환경변수 검증 실패", parsed.error.flatten().fieldErrors);
    throw new Error("invalid_environment");
  }
  cached = parsed.data;
  return cached;
}

export function allowedOrigins(): string[] {
  return env()
    .ALLOWED_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
