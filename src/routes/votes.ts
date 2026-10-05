import type { Hono } from "hono";
import { z } from "zod";
import { getSql } from "../db/client";
import { fail, isUniqueViolation } from "../lib/http";
import { newBallotId } from "../lib/ids";
import { computePhase } from "../lib/phase";
import { enforceRateLimit } from "../lib/rateLimit";
import { requireParticipant } from "../auth/middleware";

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
  // POST /api/votes — 7.1 조건 전체를 한 트랜잭션에서 확인 (SSOT 7.1, 7.2)
  app.post("/api/votes", async (c) => {
    const session = await requireParticipant(c);
    await enforceRateLimit(session.participantId, "votes", 40, 15);

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

        const works = await tx<{ id: string; visible: boolean; deleted: boolean; participant_id: string }[]>`
          select id, visible, deleted, participant_id from works where id = any(${workIds}) for share
        `;
        if (works.length !== workIds.length) fail("invalid_selection");
        for (const w of works) {
          if (!w.visible || w.deleted) fail("invalid_selection");
          if (w.participant_id === session.participantId) fail("self_vote");
        }

        await tx`insert into ballots (id, participant_id) values (${ballotId}, ${session.participantId})`;
        for (const workId of workIds) {
          await tx`insert into ballot_choices (ballot_id, work_id) values (${ballotId}, ${workId})`;
        }
        await tx`insert into audit (action, detail) values ('투표 접수', ${"1인 " + workIds.length + "개 선정"})`;
      });
    } catch (err) {
      if (isUniqueViolation(err) && (err as { constraint_name?: string }).constraint_name === "ballots_participant_uq") {
        fail("already_voted");
      }
      throw err;
    }

    return c.json({ ok: true, receipt: ballotId }, 201);
  });
}
