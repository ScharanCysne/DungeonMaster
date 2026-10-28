import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { GameEvent } from '@dungeon/shared';
import { readTraceTotals, writeJson } from './traces.js';

const settingsSchema = z.strictObject({ budgetUsd: z.number().nonnegative() });
export function saveBudget(dataDir: string, id: string, budgetUsd: number) {
  return writeJson(join(dataDir, 'sessions', id, 'settings.json'), {
    budgetUsd,
  });
}
export async function readBudget(
  dataDir: string,
  id: string,
  fallback: number,
) {
  try {
    return settingsSchema.parse(
      JSON.parse(
        await readFile(join(dataDir, 'sessions', id, 'settings.json'), 'utf8'),
      ),
    ).budgetUsd;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return fallback;
    throw error;
  }
}
export async function writeSummary(
  dataDir: string,
  id: string,
  records: GameEvent[],
  budgetUsd: number,
) {
  const totals = await readTraceTotals(dataDir, id);
  const ended = records.findLast((record) => record.type === 'EpisodeEnded');
  await writeJson(join(dataDir, 'sessions', id, 'summary.json'), {
    sessionId: id,
    beats: records.at(-1)?.beat ?? 0,
    holder: ended?.payload.holder ?? null,
    costUsd: totals.costUsd,
    budgetUsd,
    toolErrorRate: totals.toolCalls ? totals.toolErrors / totals.toolCalls : 0,
    criticRejections: totals.criticRejections,
    criticFallbacks: totals.criticFallbacks,
    leakCount: totals.leakCount,
  });
}
