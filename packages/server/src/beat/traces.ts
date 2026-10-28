import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { CriticCheck } from '../agents/critic/check.js';
import type { ReviewResult } from '../agents/critic/review.js';
import type { DmBeatResult } from '../agents/dm/types.js';
import { JsonlTraceSink, MemoryTraceSink } from '../agents/llm/traces.js';
import type { LlmTrace, TraceSink } from '../agents/llm/traces.js';
import { traceValue } from '../agents/llm/traceSerialization.js';
import { logPath } from '../ontology/eventLog.js';

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(
    temporary,
    `${JSON.stringify(traceValue(value, [process.env.ANTHROPIC_API_KEY ?? '']), null, 2)}\n`,
    { mode: 0o600 },
  );
  await rename(temporary, path);
}

export const metricsSchema = z.object({
  toolCalls: z.number().nonnegative(),
  toolErrors: z.number().nonnegative(),
  criticRejections: z.number().nonnegative(),
  criticFallbacks: z.number().nonnegative(),
  leakCount: z.number().nonnegative(),
});
export type Metrics = z.infer<typeof metricsSchema>;
export function metrics(
  dm?: DmBeatResult,
  review?: ReviewResult,
  promptLeaks = 0,
  checks: CriticCheck[] = [],
): Metrics {
  const verdicts = review?.verdicts ?? checks.map(({ verdict }) => verdict);
  return {
    toolCalls: dm?.toolCalls.length ?? 0,
    toolErrors: dm?.toolCalls.filter(({ ok }) => !ok).length ?? 0,
    criticRejections: verdicts.filter((verdict) => verdict && !verdict.ok)
      .length,
    criticFallbacks: review?.fallback ? 1 : 0,
    leakCount:
      promptLeaks +
      (verdicts.flatMap((verdict) =>
        verdict && !verdict.ok
          ? verdict.issues.filter(
              ({ type }) =>
                type === 'perspective_leak' || type === 'npc_knowledge_leak',
            )
          : [],
      ).length ?? 0),
  };
}

export class AttemptTrace implements TraceSink {
  readonly memory = new MemoryTraceSink();
  readonly file: string;
  readonly #jsonl: JsonlTraceSink;
  #report: Record<string, unknown> | undefined;
  #tail: Promise<void> = Promise.resolve();
  constructor(
    dataDir: string,
    sessionId: string,
    readonly beat: number,
    readonly attempt: number,
    private readonly onCost: (cost: number) => void = () => {},
  ) {
    this.file = join(
      dirname(logPath(dataDir, sessionId)),
      'traces',
      `beat-${beat}-${attempt}.json`,
    );
    this.#jsonl = new JsonlTraceSink(dataDir, sessionId, beat);
  }
  get costUsd() {
    return this.memory.records.reduce((sum, call) => sum + call.costUsd, 0);
  }
  async write(call: LlmTrace): Promise<void> {
    this.memory.write(call);
    this.onCost(call.costUsd);
    await this.#jsonl.write(call);
    if (this.#report) await this.save();
  }
  async finish(report: Record<string, unknown>): Promise<void> {
    this.#report = report;
    await this.save();
  }
  private save(): Promise<void> {
    const report = {
      ...this.#report,
      beat: this.beat,
      attempt: this.attempt,
      calls: [...this.memory.records],
      costUsd: this.costUsd,
    };
    const operation = this.#tail.then(() => writeJson(this.file, report));
    this.#tail = operation.catch(() => {});
    return operation;
  }
}

const reportSchema = z.object({
  beat: z.int(),
  attempt: z.int(),
  costUsd: z.number().nonnegative(),
  metrics: metricsSchema,
});
export async function readTraceTotals(dataDir: string, sessionId: string) {
  const directory = join(dirname(logPath(dataDir, sessionId)), 'traces');
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
      throw error;
    names = [];
  }
  const reports = await Promise.all(
    names
      .filter((name) => /^beat-\d+-\d+\.json$/.test(name))
      .map(async (name) =>
        reportSchema.parse(
          JSON.parse(await readFile(join(directory, name), 'utf8')),
        ),
      ),
  );
  return reports.reduce<
    Metrics & { costUsd: number; attempts: { beat: number; attempt: number }[] }
  >(
    (total, report) => ({
      costUsd: total.costUsd + report.costUsd,
      toolCalls: total.toolCalls + report.metrics.toolCalls,
      toolErrors: total.toolErrors + report.metrics.toolErrors,
      criticRejections:
        total.criticRejections + report.metrics.criticRejections,
      criticFallbacks: total.criticFallbacks + report.metrics.criticFallbacks,
      leakCount: total.leakCount + report.metrics.leakCount,
      attempts: [
        ...total.attempts,
        { beat: report.beat, attempt: report.attempt },
      ],
    }),
    {
      costUsd: 0,
      ...metrics(),
      attempts: [],
    },
  );
}
