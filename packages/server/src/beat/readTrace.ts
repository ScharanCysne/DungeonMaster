import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import {
  beatTraceSchema,
  criticVerdictSchema,
  gameEventSchema,
  modelRoleSchema,
  peerTurnSchema,
  playerIntentSchema,
  characterIdSchema,
} from '@dungeon/shared';
import type { CharacterId } from '@dungeon/shared';
import { logPath } from '../ontology/eventLog.js';

const reportSchema = z.object({
  traceId: z.string(),
  beat: z.int().nonnegative(),
  attempt: z.int().nonnegative(),
  intents: playerIntentSchema,
  peerTurns: z.array(
    z.object({ actor: characterIdSchema, turn: peerTurnSchema }),
  ),
  events: z.array(gameEventSchema),
  calls: z.array(
    z.object({
      role: modelRoleSchema,
      modelRequested: z.string(),
      modelServed: z.string().nullable(),
      promptVersion: z.string(),
      request: z.json(),
      response: z.json(),
      usage: z
        .object({
          inputTokens: z.number(),
          outputTokens: z.number(),
          cacheCreationInputTokens: z.number(),
          cacheReadInputTokens: z.number(),
        })
        .nullable(),
      latencyMs: z.number(),
      costUsd: z.number(),
    }),
  ),
  critic: z.object({
    checks: z.array(z.object({ verdict: criticVerdictSchema.nullable() })),
  }),
  latencyMs: z.number(),
  costUsd: z.number(),
  outcome: z.enum(['committed', 'fallback', 'aborted']),
});

export async function readTrace(
  dataDir: string,
  sessionId: string,
  player: CharacterId,
  beat: number,
  attempt?: number,
) {
  if (
    !Number.isSafeInteger(beat) ||
    beat < 0 ||
    (attempt !== undefined && (!Number.isSafeInteger(attempt) || attempt < 0))
  )
    throw new Error('Invalid trace coordinates.');
  const directory = join(dirname(logPath(dataDir, sessionId)), 'traces');
  if (attempt === undefined) {
    const attempts = (await readdir(directory)).flatMap((name) => {
      const match = /^beat-(\d+)-(\d+)\.json$/.exec(name);
      return match && Number(match[1]) === beat ? [Number(match[2])] : [];
    });
    if (!attempts.length) throw new Error('Trace not found.');
    attempt = Math.max(...attempts);
  }
  const report = reportSchema.parse(
    JSON.parse(
      await readFile(join(directory, `beat-${beat}-${attempt}.json`), 'utf8'),
    ),
  );
  const verdict = report.critic.checks.at(-1)?.verdict;
  return beatTraceSchema.parse({
    traceId: report.traceId,
    beat: report.beat,
    attempt: report.attempt,
    intents: [
      {
        actor: player,
        selection: report.intents.selection,
        text: report.intents.text,
        private: true,
      },
      ...report.peerTurns.flatMap(({ actor, turn }) =>
        turn.kind === 'intent'
          ? [
              {
                actor,
                selection: turn.refs,
                text: turn.text,
                private: turn.private,
              },
            ]
          : [],
      ),
    ],
    peerTurns: report.peerTurns,
    calls: report.calls.map((call) => ({
      role: call.role,
      model: call.modelServed ?? call.modelRequested,
      promptVersion: call.promptVersion,
      request: call.request,
      response: call.response,
      usage: {
        input: call.usage?.inputTokens ?? 0,
        output: call.usage?.outputTokens ?? 0,
        cacheWrite: call.usage?.cacheCreationInputTokens ?? 0,
        cacheRead: call.usage?.cacheReadInputTokens ?? 0,
      },
      latencyMs: call.latencyMs,
      costUsd: call.costUsd,
    })),
    events: report.events,
    ...(verdict ? { critic: verdict } : {}),
    latencyMs: report.latencyMs,
    costUsd: report.costUsd,
    outcome: report.outcome,
  });
}
