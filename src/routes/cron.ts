import type { Hono } from "hono";
import { getSql } from "../db/client.js";
import { env } from "../lib/env.js";
import { fail } from "../lib/http.js";
import { removeObject } from "../storage/index.js";

export function registerCronRoutes(app: Hono) {
  // GET /api/cron/cleanup — Vercel Cron 전용, 공개 계약 아님 (SSOT 9.2, 11.1)
  app.get("/api/cron/cleanup", async (c) => {
    const auth = c.req.header("authorization");
    if (auth !== `Bearer ${env().CRON_SECRET}`) fail("unauthorized");

    const sql = getSql();
    const cutoff = new Date(Date.now() - 24 * 3600_000);

    const orphans = await sql<{ id: string }[]>`select id from files where work_id is null and created < ${cutoff}`;
    for (const f of orphans) {
      await removeObject(f.id);
    }
    if (orphans.length) {
      await sql`delete from files where id = any(${orphans.map((f) => f.id)})`;
    }

    const expiredSessions = await sql`delete from sessions where expires < now() returning token_hash`;

    await sql`insert into audit (action, detail) values ('크론 정리', ${`미귀속 파일 ${orphans.length}건, 만료 세션 ${expiredSessions.length}건`})`;

    return c.json({ ok: true, removedFiles: orphans.length, removedSessions: expiredSessions.length });
  });
}
