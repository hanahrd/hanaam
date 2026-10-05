import type { Hono } from "hono";
import { getSql } from "../db/client.js";
import { requireMemberSession } from "../auth/middleware.js";

export function registerParticipantRoutes(app: Hono) {
  // GET /api/me — 로그인한 제작자(업로더)의 닉네임. participant_id는 노출하지 않는다.
  app.get("/api/me", async (c) => {
    const session = await requireMemberSession(c);
    if (!session.participantId) return c.json({ participant: null, csrf: session.csrf });
    const sql = getSql();
    const rows = await sql<{ nickname: string }[]>`select nickname from participants where id = ${session.participantId}`;
    return c.json({ participant: rows[0] ? { nickname: rows[0].nickname } : null, csrf: session.csrf });
  });
}
