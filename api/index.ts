import { Hono } from "hono";
import { handle } from "hono/vercel";
import { ApiError, ERROR_STATUS } from "../src/lib/http";
import { registerPublicRoutes } from "../src/routes/public";
import { registerAuthRoutes } from "../src/routes/auth";
import { registerParticipantRoutes } from "../src/routes/participants";
import { registerBootstrapRoutes } from "../src/routes/bootstrap";
import { registerUploadRoutes } from "../src/routes/uploads";
import { registerWorkRoutes } from "../src/routes/works";
import { registerVoteRoutes } from "../src/routes/votes";
import { registerAdminRoutes } from "../src/routes/admin";
import { registerCronRoutes } from "../src/routes/cron";

// Node.js 런타임 (Edge 아님) — pg/postgres.js, crypto.pbkdf2, Supabase SDK가 안정적으로 동작한다 (SSOT 9.1).
export const config = { runtime: "nodejs" };

const app = new Hono();

app.use("*", async (c, next) => {
  c.header("X-Robots-Tag", "noindex, nofollow");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});

registerPublicRoutes(app);
registerAuthRoutes(app);
registerParticipantRoutes(app);
registerBootstrapRoutes(app);
registerUploadRoutes(app);
registerWorkRoutes(app);
registerVoteRoutes(app);
registerAdminRoutes(app);
registerCronRoutes(app);

app.notFound((c) => c.json({ error: "not_found" }, 404));

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: err.code }, err.status as 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500);
  }
  console.error(err);
  return c.json({ error: "server_error" }, 500);
});

// scripts/dev-server.ts(로컬 전용)에서 재사용하기 위한 named export. Vercel 빌드에는 영향 없음.
export { app };

export default handle(app);
