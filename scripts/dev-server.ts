/**
 * 로컬 전용 개발 서버 — Vercel CLI/로그인 없이 api/index.ts의 Hono 앱 + public/ 정적파일을
 * 순수 Node http로 서빙한다. 운영 배포(Vercel)와는 무관하며, DB(Supabase)까지 실제로 붙여서
 * 로컬에서 end-to-end 확인하기 위한 용도다.
 * 실행: npm run dev:local  (.env 필요)
 */
import { createServer, type IncomingMessage } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { app } from "../api/index";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");
const PORT = Number(process.env.PORT ?? 3000);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ico": "image/x-icon",
};

function nodeRequestToFetchRequest(req: IncomingMessage, url: URL): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  const hasBody = !["GET", "HEAD"].includes(req.method ?? "GET");
  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
    body: hasBody ? (req as unknown as ReadableStream) : undefined,
  };
  if (hasBody) init.duplex = "half";
  return new Request(url, init);
}

async function serveStaticFile(pathname: string): Promise<{ status: number; body: Buffer | string; type: string }> {
  let rel = pathname === "/" ? "/index.html" : pathname;
  if (rel.startsWith("/admin") && !extname(rel)) rel = "/admin/index.html";
  const safePath = normalize(join(PUBLIC_DIR, rel));
  if (!safePath.startsWith(PUBLIC_DIR)) return { status: 403, body: "Forbidden", type: "text/plain" };
  try {
    const info = await stat(safePath);
    if (info.isDirectory()) throw new Error("directory");
    const data = await readFile(safePath);
    return { status: 200, body: data, type: MIME[extname(safePath)] ?? "application/octet-stream" };
  } catch {
    return { status: 404, body: "Not Found", type: "text/plain" };
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

    if (url.pathname.startsWith("/api/")) {
      const request = nodeRequestToFetchRequest(req, url);
      const response = await app.fetch(request);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() === "set-cookie") return; // 아래에서 다중 쿠키 처리
        res.setHeader(key, value);
      });
      // Headers 객체는 set-cookie 여러 개를 합쳐버리므로 getSetCookie()로 분리 처리
      const setCookies = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.();
      if (setCookies && setCookies.length > 0) res.setHeader("Set-Cookie", setCookies);
      const buf = Buffer.from(await response.arrayBuffer());
      res.end(buf);
      return;
    }

    const file = await serveStaticFile(url.pathname);
    res.statusCode = file.status;
    res.setHeader("Content-Type", file.type);
    res.end(file.body);
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
});

server.listen(PORT, () => {
  console.log(`로컬 서버 실행 중: http://localhost:${PORT}  (참여자) / http://localhost:${PORT}/admin (관리자)`);
});
