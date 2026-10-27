import { expect, test } from 'vitest';
import * as c from './config.js';
import { schemaCases } from './testing/schema-cases.js';

schemaCases([
  ['per-beat limits', c.perBeatLimitsSchema, {}, { toolCalls: '8' }],
  [
    'generator stat bounds',
    c.generatorStatBoundsSchema,
    {},
    { abilityMin: 19, abilityMax: 18 },
  ],
  ['timeouts', c.timeoutsSchema, {}, { dmMs: -1 }],
  ['input limits', c.inputLimitsSchema, {}, { intentText: 501 }],
  ['model map', c.modelMapSchema, {}, { dm: null }],
  ['budget', c.budgetSchema, {}, { sessionUsd: -5 }],
  [
    'model price',
    c.modelPriceSchema,
    {
      input: 1,
      cacheWrite5m: 1.25,
      cacheWrite1h: 2,
      cacheRead: 0.1,
      output: 5,
    },
    { input: 1, output: 5 },
  ],
  ['config', c.configSchema, {}, { limit: { toolCalls: 8 } }],
]);
test('empty config supplies all per-beat defaults', () => {
  expect(c.defaultConfig.limits).toEqual({
    toolCalls: 8,
    generatorCalls: 3,
    voiceNpcPerBeat: 4,
    retryToolCallsForUnbackedOutcome: 2,
    newNpcsPerEpisode: 12,
    generatedItemMaxRarity: 'rare',
    generatedItemMaxValueGp: 500,
    attitudeDelta: 30,
  });
});
test('empty config supplies timeout defaults in milliseconds', () => {
  expect(c.defaultConfig.timeouts).toEqual({
    dmMs: 60_000,
    othersMs: 20_000,
    providerRetries: 2,
    beatMs: 120_000,
    neo4jQueryMs: 5_000,
    neo4jTransactionMs: 10_000,
    heartbeatMs: 15_000,
    pauseAutoRetryMs: 600_000,
  });
});
test('empty config supplies input and context limits', () => {
  expect(c.defaultConfig.input).toEqual({
    intentText: 500,
    maxSelection: 6,
    contextBudgetTokens: 12_000,
  });
});
test('empty config assigns the specified models to all seven roles', () => {
  expect(c.defaultConfig.models).toEqual({
    dm: 'claude-opus-5-5',
    story: 'claude-sonnet-5-5',
    peer: 'claude-sonnet-5-5',
    npc_voice: 'claude-sonnet-5-5',
    generator: 'claude-sonnet-5-5',
    critic: 'claude-sonnet-5-5',
    recap: 'claude-sonnet-5-5',
  });
});
test('empty config supplies USD budget defaults', () => {
  expect(c.defaultConfig.budget).toEqual({
    sessionUsd: 5,
    stepUsd: 5,
    evalUsd: 10,
  });
});
test('empty config supplies configurable NPC policy bounds', () => {
  expect(c.defaultConfig.generatorStats).toEqual({
    abilityMin: 6,
    abilityMax: 18,
    hpMin: 4,
    hpMax: 40,
    acMin: 10,
    acMax: 17,
  });
});
test('partial nested config preserves unspecified defaults', () => {
  expect(c.configSchema.parse({ timeouts: { dmMs: 30_000 } }).timeouts).toEqual(
    { ...c.defaultConfig.timeouts, dmMs: 30_000 },
  );
});
test('config supplies published prices for every configured model', () => {
  expect(c.defaultConfig.prices).toEqual(c.defaultModelPrices);
  for (const model of Object.values(c.defaultConfig.models)) {
    expect(c.defaultConfig.prices[model]).toBeDefined();
  }
});
test('config accepts a supplied per-million-token price table', () => {
  expect(
    c.configSchema.safeParse({
      prices: {
        'test-model': {
          input: 1,
          cacheWrite5m: 1,
          cacheWrite1h: 2,
          cacheRead: 0.1,
          output: 2,
        },
      },
    }).success,
  ).toBe(true);
});
test('config rejects a selection limit beyond the protocol ceiling', () => {
  expect(c.configSchema.safeParse({ input: { maxSelection: 7 } }).success).toBe(
    false,
  );
});
schemaCases([
  [
    'NPC voice model override',
    c.modelMapSchema,
    { npc_voice: 'test-voice-model' },
    { npc_voice: '' },
  ],
]);
test('config preserves an NPC voice model override', () => {
  expect(
    c.configSchema.parse({ models: { npc_voice: 'test-voice-model' } }).models,
  ).toEqual({
    ...c.defaultConfig.models,
    npc_voice: 'test-voice-model',
  });
});
for (const limit of ['voiceNpcPerBeat', 'retryToolCallsForUnbackedOutcome']) {
  test.each([0, 1])(
    'config accepts ' + limit + ' override %s and preserves other defaults',
    (value) => {
      expect(
        c.configSchema.parse({ limits: { [limit]: value } }).limits,
      ).toEqual({
        ...c.defaultConfig.limits,
        [limit]: value,
      });
    },
  );
  test.each([-1, 1.5, '2', null])(
    'config rejects ' + limit + ' override %s',
    (value) => {
      expect(
        c.configSchema.safeParse({ limits: { [limit]: value } }).success,
      ).toBe(false);
    },
  );
}
