import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { LlmUnavailableError } from './errors.js';
import { ScriptedProvider } from './ScriptedProvider.js';
import { TracingProvider } from './TracingProvider.js';
import { JsonlTraceSink, MemoryTraceSink } from './traces.js';
import {
  fakeKey,
  providerFor,
  request,
  resultSchema,
  wireMessage,
} from './testing.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it('records full redacted calls, effective settings and usage in memory and beat JSONL', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dungeon-llm-trace-'));
  try {
    vi.stubEnv('ANTHROPIC_API_KEY', fakeKey);
    vi.stubEnv('ANTHROPIC_LOG', 'debug');
    const logs = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
      vi.spyOn(console, 'debug'),
    ];
    const { provider } = providerFor(
      wireMessage({
        model: 'claude-sonnet-5-5',
        content: [{ type: 'text', text: fakeKey }],
      }),
    );
    const memory = new MemoryTraceSink();
    const file = new JsonlTraceSink(directory, 'session-1', 7);
    let time = 100;
    const traced = new TracingProvider(provider, [memory, file], {
      now: () => (time += 7),
    });
    await traced.complete({
      ...request,
      role: 'dm',
      promptVersion: 'v1',
      knowledgeSliceHash: 'knowledge-sha256',
      messages: [{ role: 'user', content: `Secret echo ${fakeKey}` }],
    });
    const record = memory.records[0];
    expect(record).toMatchObject({
      role: 'dm',
      modelRequested: 'claude-opus-5-5',
      modelServed: 'claude-sonnet-5-5',
      effort: 'medium',
      promptVersion: 'v1',
      knowledgeSliceHash: 'knowledge-sha256',
      latencyMs: 7,
      stopReason: 'end_turn',
      fallbackUsed: true,
      cacheMiss: false,
      request: {
        timeoutMs: 60_000,
        messages: [{ content: 'Secret echo [REDACTED]' }],
      },
      response: { content: [{ text: '[REDACTED]' }] },
      usage: { cacheReadInputTokens: 40 },
    });
    expect(record?.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(record?.costUsd).toBeGreaterThan(0);
    const contents = await readFile(file.file, 'utf8');
    expect(contents.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(contents)).toEqual(record);
    expect(
      JSON.stringify(memory.records) +
        contents +
        JSON.stringify(logs.map((spy) => spy.mock.calls)),
    ).not.toContain(fakeKey);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('hashes canonical requests and records schemas without Zod internals', async () => {
  const provider = new ScriptedProvider({
    peer: Array.from({ length: 3 }, () => ({
      type: 'structured' as const,
      output: { ok: true },
    })),
  });
  const memory = new MemoryTraceSink();
  const traced = new TracingProvider(provider, [memory]);
  await traced.complete({ ...request, outputFormat: resultSchema });
  await traced.complete({
    maxTokens: 64,
    messages: request.messages,
    system: request.system,
    role: 'peer',
    outputFormat: resultSchema,
  });
  await traced.complete({
    ...request,
    maxTokens: 65,
    outputFormat: resultSchema,
  });
  expect(memory.records[0]?.promptHash).toBe(memory.records[1]?.promptHash);
  expect(memory.records[0]?.promptHash).not.toBe(memory.records[2]?.promptHash);
  expect(memory.records[0]?.request).toMatchObject({
    outputFormat: { type: 'object', properties: { ok: { type: 'boolean' } } },
  });
  expect(JSON.stringify(memory.records)).not.toContain('_def');
});

it('traces typed failures and retains the provider error', async () => {
  const error = new LlmUnavailableError(
    'peer',
    'claude-haiku-5-5',
    'unavailable',
  );
  const memory = new MemoryTraceSink();
  const traced = new TracingProvider(
    new ScriptedProvider({ peer: [{ type: 'error', error }] }),
    [memory],
  );
  await expect(traced.complete(request)).rejects.toBe(error);
  expect(memory.records[0]).toMatchObject({
    response: null,
    stopReason: null,
    error: { name: 'LlmUnavailableError' },
  });
});

it('retains refusal usage and cost, and flags a DM cache miss', async () => {
  const { provider } = providerFor(
    wireMessage({
      stop_reason: 'refusal',
      model: 'claude-opus-5-5',
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation: null,
      },
    }),
  );
  const memory = new MemoryTraceSink();
  await expect(
    new TracingProvider(provider, [memory]).complete({
      ...request,
      role: 'dm',
    }),
  ).rejects.toThrow('final refusal');
  expect(memory.records[0]).toMatchObject({
    stopReason: 'refusal',
    costUsd: 0.00014,
    cacheMiss: true,
    promptBelowCacheMinimum: true,
  });
});

it('serializes simultaneous calls as complete JSONL records and redacts injected secrets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dungeon-llm-parallel-'));
  try {
    const secret = 'fake-private-key-without-provider-prefix';
    const text = `${secret} ${'large response '.repeat(50_000)}`;
    const provider = new ScriptedProvider({
      peer: [
        { type: 'text', text },
        { type: 'text', text },
      ],
    });
    const file = new JsonlTraceSink(directory, 'session', 1);
    const traced = new TracingProvider(provider, [file], { secrets: [secret] });
    await Promise.all([traced.complete(request), traced.complete(request)]);
    const contents = await readFile(file.file, 'utf8');
    expect(contents).not.toContain(secret);
    const lines = contents.trim().split('\n');
    expect(lines).toHaveLength(2);
    for (const line of lines)
      expect(JSON.parse(line)).toMatchObject({
        role: 'peer',
        stopReason: 'end_turn',
      });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it.each(['../outside', '/absolute', '..', 'bad/name'])(
  'rejects unsafe trace paths: %s',
  (session) => {
    expect(() => new JsonlTraceSink('/tmp', session, 1)).toThrow(
      'Invalid trace session id',
    );
  },
);
it.each([-1, 1.5, Number.NaN])('rejects invalid beat numbers: %s', (beat) => {
  expect(() => new JsonlTraceSink('/tmp', 'session', beat)).toThrow(
    'Invalid trace beat number',
  );
});
