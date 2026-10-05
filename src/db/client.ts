import postgres from "postgres";
import { env } from "../lib/env";

declare global {
  // eslint-disable-next-line no-var
  var __hana_sql__: ReturnType<typeof postgres> | undefined;
}

/**
 * Supabase 트랜잭션 풀러(6543) 연결. prepare:false, 인스턴스당 max:1 (SSOT 9.1).
 * 서버리스 인스턴스가 늘어도 직접 연결 한도를 넘지 않도록 한다.
 */
export function getSql() {
  if (!globalThis.__hana_sql__) {
    globalThis.__hana_sql__ = postgres(env().DATABASE_URL, {
      prepare: false,
      max: 1,
      ssl: "require",
      connection: { application_name: "hana-ai-market" },
    });
  }
  return globalThis.__hana_sql__;
}

export type Sql = ReturnType<typeof getSql>;
