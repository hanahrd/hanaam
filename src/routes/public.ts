import type { Hono } from "hono";
import { getSql } from "../db/client";

interface SettingsPayload {
  siteName: string;
  welcome: string;
  [key: string]: unknown;
}

export function registerPublicRoutes(app: Hono) {
  // GET /api/public — 비로그인 공개 API. 서비스명·환영문구만 (SSOT 11.1).
  app.get("/api/public", async (c) => {
    const sql = getSql();
    const rows = await sql<{ payload: SettingsPayload }[]>`select payload from settings where id = 1`;
    const payload = rows[0]?.payload;
    return c.json({ siteName: payload?.siteName ?? "하나증권 AI 마켓", welcome: payload?.welcome ?? "" });
  });
}
