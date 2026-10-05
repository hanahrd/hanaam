import type { Hono } from "hono";
import { z } from "zod";
import { getSql } from "../db/client.js";
import { fail, isUniqueViolation } from "../lib/http.js";
import { newBallotId } from "../lib/ids.js";
import { computePhase } from "../lib/phase.js";
import { enforceRateLimit } from "../lib/rateLimit.js";
import { checkOrigin } from "../auth/middleware.js";
import { getVoterToken, hashVoterToken, newVoterToken, voterCookieHeader } from "../auth/voter.js";

const voteSchema = z.object({
  workIds: z.array(z.string()).min(1).max(20),
  consent: z.literal(true),
});

interface SettingsRow {
  submissionDeadline: string;
  voteStart: string;
  voteEnd: string;
  voteCount: number;
}

export function registerVoteRoutes(app: Hono) {
  // POST /api/votes — 로그인 없는 익명 투표. 중복 투표는 브라우저 쿠키 토큰 해시로만 판정한다(SSOT 재검토 예정).
  app.post("/api/votes", async (c) => {
    checkOrigin(c);
    let token = getVoterToken(c.req.header("cookie") ?? null);
    const isNewToken = !token;
    if (!token) token = newVoterToken();
    const tokenHash = hashVoterToken(token);
    await enforceRateLimit(tokenHash, "votes", 40, 15);

    const body = voteSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) fail("invalid_input");
    const { workIds, consent } = body.data;
    if (!consent) fail("consent_required");
    if (new Set(workIds).size !== workIds.length) fail("invalid_selection");

    const sql = getSql();
    const ballotId = newBallotId();

    try {
      await sql.begin(async (tx) => {
        const settingsRows = await tx<{ payload: SettingsRow }[]>`select payload from settings where id = 1 for share`;
        const settings = settingsRows[0]?.payload;
        if (!settings) fail("server_error");
        if (computePhase(settings) !== "voting") fail("voting_closed");
        if (workIds.length !== settings.voteCount) fail("selection_count");

        const works = await tx<{ id: string; visible: boolean; deleted: boolean }[]>`
          select id, visible, deleted from works where id = any(${workIds}) for share
        `;
        if (works.length !== workIds.length) fail("invalid_selection");
        for (const w of works) {
          if (!w.visible || w.deleted) fail("invalid_selection");
        }

        await tx`insert into ballots (id, voter_token_hash) values (${ballotId}, ${tokenHash})`;
        for (const workId of workIds) {
          await tx`insert into ballot_choices (ballot_id, work_id) values (${ballotId}, ${workId})`;
        }
        await tx`insert into audit (action, detail) values ('투표 접수', ${"비로그인 투표 " + workIds.length + "개 선정"})`;
      });
    } catch (err) {
      if (isUniqueViolation(err)) fail("already_voted");
      throw err;
    }

    if (isNewToken) c.header("Set-Cookie", voterCookieHeader(token), { append: true });
    return c.json({ ok: true, receipt: ballotId }, 201);
  });
}
