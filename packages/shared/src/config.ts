import { z } from 'zod';
import { raritySchema } from './primitives.js';

export const perBeatLimitsSchema = z.strictObject({
  toolCalls: z.int().positive().default(8),
  generatorCalls: z.int().nonnegative().default(3),
  voiceNpcPerBeat: z.int().nonnegative().default(4),
  retryToolCallsForUnbackedOutcome: z.int().nonnegative().default(2),
  newNpcsPerEpisode: z.int().nonnegative().default(12),
  generatedItemMaxRarity: raritySchema.default('rare'),
  generatedItemMaxValueGp: z.number().nonnegative().default(500),
  attitudeDelta: z.int().nonnegative().max(30).default(30),
});
export type PerBeatLimits = z.infer<typeof perBeatLimitsSchema>;
export const generatorStatBoundsSchema = z
  .strictObject({
    abilityMin: z.int().default(6),
    abilityMax: z.int().default(18),
    hpMin: z.int().default(4),
    hpMax: z.int().default(40),
    acMin: z.int().default(10),
    acMax: z.int().default(17),
  })
  .refine(
    (bounds) =>
      bounds.abilityMin <= bounds.abilityMax &&
      bounds.hpMin <= bounds.hpMax &&
      bounds.acMin <= bounds.acMax,
    { message: 'Generator minimums must not exceed maximums' },
  );
export type GeneratorStatBounds = z.infer<typeof generatorStatBoundsSchema>;
export const timeoutsSchema = z.strictObject({
  dmMs: z.int().positive().default(60_000),
  othersMs: z.int().positive().default(20_000),
  providerRetries: z.int().nonnegative().default(2),
  beatMs: z.int().positive().default(120_000),
  neo4jQueryMs: z.int().positive().default(5_000),
  neo4jTransactionMs: z.int().positive().default(10_000),
  heartbeatMs: z.int().positive().default(15_000),
  pauseAutoRetryMs: z.int().positive().default(600_000),
});
export type Timeouts = z.infer<typeof timeoutsSchema>;
export const inputLimitsSchema = z.strictObject({
  intentText: z.int().positive().max(500).default(500),
  maxSelection: z.int().nonnegative().max(6).default(6),
  contextBudgetTokens: z.int().positive().default(12_000),
});
export type InputLimits = z.infer<typeof inputLimitsSchema>;
export const modelMapSchema = z.strictObject({
  dm: z.string().min(1).default('claude-opus-5-5'),
  story: z.string().min(1).default('claude-sonnet-5-5'),
  peer: z.string().min(1).default('claude-sonnet-5-5'),
  npc_voice: z.string().min(1).default('claude-sonnet-5-5'),
  generator: z.string().min(1).default('claude-sonnet-5-5'),
  critic: z.string().min(1).default('claude-sonnet-5-5'),
  recap: z.string().min(1).default('claude-sonnet-5-5'),
});
export type ModelMap = z.infer<typeof modelMapSchema>;
export const effortSchema = z.enum(['low', 'medium', 'high', 'xhigh', 'max']);
export const effortMapSchema = z.strictObject({
  dm: effortSchema.default('medium'),
  story: effortSchema.default('medium'),
  peer: effortSchema.default('low'),
  npc_voice: effortSchema.default('low'),
  generator: effortSchema.default('low'),
  critic: effortSchema.default('low'),
  recap: effortSchema.default('low'),
});
export const budgetSchema = z.strictObject({
  sessionUsd: z.number().nonnegative().default(5),
  stepUsd: z.number().positive().default(5),
  evalUsd: z.number().nonnegative().default(10),
});
export type Budget = z.infer<typeof budgetSchema>;
const tokenPriceSchema = z.strictObject({
  input: z.number().nonnegative(),
  cacheWrite5m: z.number().nonnegative(),
  cacheWrite1h: z.number().nonnegative(),
  cacheRead: z.number().nonnegative(),
  output: z.number().nonnegative(),
});
export const modelPriceSchema = tokenPriceSchema.extend({
  longContext: tokenPriceSchema
    .extend({ aboveInputTokens: z.int().positive() })
    .optional(),
});
export type ModelPrice = z.infer<typeof modelPriceSchema>;
export const defaultModelPrices: Record<string, ModelPrice> = {
  'claude-opus-5-5': {
    input: 4,
    output: 20,
    cacheRead: 0.2,
    cacheWrite5m: 5,
    cacheWrite1h: 8,
  },
  'claude-sonnet-5-5': {
    input: 2,
    output: 10,
    cacheRead: 0.2,
    cacheWrite5m: 2.5,
    cacheWrite1h: 4,
  },
  'claude-haiku-5-5': {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    cacheWrite5m: 0.125,
    cacheWrite1h: 0.2,
    longContext: {
      aboveInputTokens: 100_000,
      input: 0.5,
      output: 2.5,
      cacheRead: 0.01,
      cacheWrite5m: 0.625,
      cacheWrite1h: 1,
    },
  },
};
export const configSchema = z.strictObject({
  limits: perBeatLimitsSchema.prefault({}),
  timeouts: timeoutsSchema.prefault({}),
  input: inputLimitsSchema.prefault({}),
  models: modelMapSchema.prefault({}),
  efforts: effortMapSchema.prefault({}),
  budget: budgetSchema.prefault({}),
  generatorStats: generatorStatBoundsSchema.prefault({}),
  prices: z
    .record(z.string().min(1), modelPriceSchema)
    .default(defaultModelPrices),
});
export type Config = z.infer<typeof configSchema>;
export const defaultConfig = configSchema.parse({});
