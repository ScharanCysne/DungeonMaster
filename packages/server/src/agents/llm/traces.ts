import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { LlmEffort, LlmRole, LlmStopReason } from './types.js';
import type { TraceValue } from './traceSerialization.js';

export interface LlmTrace {
  role: LlmRole;
  modelRequested: string;
  modelServed: string | null;
  effort: LlmEffort;
  promptHash: string;
  knowledgeSliceHash: string | null;
  promptVersion: string;
  usage: TraceValue;
  costUsd: number;
  latencyMs: number;
  stopReason: LlmStopReason | null;
  fallbackUsed: boolean;
  cacheMiss: boolean;
  promptBelowCacheMinimum: boolean;
  request: TraceValue;
  response: TraceValue;
  error: TraceValue;
}
export interface TraceSink {
  write(trace: LlmTrace): void | Promise<void>;
}
export class MemoryTraceSink implements TraceSink {
  readonly records: LlmTrace[] = [];
  write(trace: LlmTrace): void {
    this.records.push(trace);
  }
}
export class JsonlTraceSink implements TraceSink {
  readonly file: string;
  private pending: Promise<void> = Promise.resolve();
  constructor(dataDir: string, sessionId: string, beat: number) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(sessionId))
      throw new Error('Invalid trace session id');
    if (!Number.isSafeInteger(beat) || beat < 0)
      throw new Error('Invalid trace beat number');
    this.file = join(
      dataDir,
      'sessions',
      sessionId,
      'traces',
      `beat-${beat}.jsonl`,
    );
  }
  write(trace: LlmTrace): Promise<void> {
    const line = `${JSON.stringify(trace)}\n`;
    const written = this.pending.then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      await appendFile(this.file, line, { encoding: 'utf8', mode: 0o600 });
    });
    // Peer calls can finish together; append whole records in invocation order.
    this.pending = written.catch(() => {});
    return written;
  }
}
