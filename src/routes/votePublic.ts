import type { Hono } from "hono";
import { getSql } from "../db/client.js";
import { fail } from "../lib/http.js";
import { computePhase, toKstIso, type ScheduleSettings } from "../lib/phase.js";
import { getVoterToken, hashVoterToken, newVoterToken, voterCookieHeader } from "../auth/voter.js";

interface SettingsPayload extends ScheduleSettings {
  siteName: string;
  welcome: string;
  voteCount: number;
}

interface FileRow {
  id: string;
  name: string;
  mime: string;
  size: number;
  work_id: string;
}

interface WorkRow {
  id: string;
  title: string;
  category: string;
  tools: string;
  description: string;
  created: Date;
  views: number;
  nickname: string;
}

/** 로그인 없는 투표자(일반사용자)용 공개 라우트. 투표 기간에만 작품 목록을 내려준다 (SSOT DEC-15 결정 반영). */
export function registerVotePublicRoutes(app: Hono) {
  app.get("/api/vote/bootstrap", async (c) => {
    const sql = getSql();
    const rows = await sql<{ payload: SettingsPayload }[]>`select payload from settings where id = 1`;
    const settings = rows[0]?.payload;
    if (!settings) fail("server_error");
    const phase = computePhase(settings);

    let token = getVoterToken(c.req.header("cookie") ?? null);
    const isNewToken = !token;
    if (!token) token = newVoterToken();
    const tokenHash = hashVoterToken(token);

    let works: ReturnType<typeof mapWork>[] = [];
    let voted = false;

    if (phase === "voting") {
      const files = await sql<FileRow[]>`
        select id, name, mime, size, work_id from files where work_id is not null and uploaded_at is not null
      `;
      const filesByWork = new Map<string, FileRow[]>();
      for (const f of files) {
        const list = filesByWork.get(f.work_id) ?? [];
        list.push(f);
        filesByWork.set(f.work_id, list);
      }
      const workRows = await sql<WorkRow[]>`
        select w.id, w.title, w.category, w.tools, w.description, w.created, w.views, p.nickname
        from works w
        join participants p on p.id = w.participant_id
        where w.deleted = false and w.visible = true
        order by w.created desc
      `;
      works = workRows.map((w) => mapWork(w, filesByWork.get(w.id) ?? []));

      const votedRows = await sql<{ exists: boolean }[]>`
        select exists(select 1 from ballots where voter_token_hash = ${tokenHash}) as exists
      `;
      voted = votedRows[0]?.exists ?? false;
    }

    if (isNewToken) c.header("Set-Cookie", voterCookieHeader(token), { append: true });

    return c.json({
      settings: {
        siteName: settings.siteName,
        welcome: settings.welcome,
        voteCount: settings.voteCount,
        voteStart: toKstIso(settings.voteStart),
        voteEnd: toKstIso(settings.voteEnd),
      },
      phase,
      serverNow: toKstIso(new Date()),
      works,
      voted,
    });
  });
}

function mapWork(w: WorkRow, files: FileRow[]) {
  return {
    id: w.id,
    title: w.title,
    category: w.category,
    tools: w.tools,
    description: w.description,
    nickname: w.nickname,
    created: toKstIso(w.created),
    views: w.views,
    files: files.map((f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size })),
  };
}
