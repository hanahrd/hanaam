/**
 * 마이그레이션 적용 스크립트 — Supabase CLI 없이 DATABASE_URL로 직접 SQL을 실행한다.
 * Windows에 Supabase CLI 설치가 번거로운 경우를 위한 대안. 이미 존재하는 테이블/정책은
 * SQL의 `if not exists` / `drop policy if exists` 구문으로 안전하게 재실행 가능해야 한다.
 * 실행: npm run db:migrate  (.env의 DATABASE_URL 필요)
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL 환경변수가 필요합니다. (.env 확인)");

  const dir = join(__dirname, "..", "supabase", "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const sql = postgres(databaseUrl, { prepare: false, max: 1, ssl: "require" });
  try {
    for (const file of files) {
      const migrationPath = join(dir, file);
      const sqlText = readFileSync(migrationPath, "utf-8");
      console.log(`마이그레이션 적용 중: ${migrationPath}`);
      await sql.unsafe(sqlText);
    }
    console.log("마이그레이션 완료.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("마이그레이션 실패:", err);
  process.exit(1);
});
