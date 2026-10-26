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
  peer: z.string().min(1).default('claude-haiku-5-5'),
  npc_voice: z.string().min(1).default('claude-haiku-5-5'),
  generator: z.string().min(1).default('claude-haiku-5-5'),
  critic: z.string().min(1).default('claude-haiku-5-5'),
  recap: z.string().min(1).default('claude-haiku-5-5'),
});
export type ModelMap = z.infer<typeof modelMapSchema>;
export const budgetSchema = z.strictObject({
  sessionUsd: z.number().nonnegative().default(5),
  stepUsd: z.number().positive().default(5),
  evalUsd: z.number().nonnegative().default(10),
});
export type Budget = z.infer<typeof budgetSchema>;
export const modelPriceSchema = z.strictObject({
  input: z.number().nonnegative(),
  cacheWrite: z.number().nonnegative(),
  cacheRead: z.number().nonnegative(),
  output: z.number().nonnegative(),
});
export type ModelPrice = z.infer<typeof modelPriceSchema>;
export const configSchema = z.strictObject({
  limits: perBeatLimitsSchema.prefault({}),
  timeouts: timeoutsSchema.prefault({}),
  input: inputLimitsSchema.prefault({}),
  models: modelMapSchema.prefault({}),
  budget: budgetSchema.prefault({}),
  generatorStats: generatorStatBoundsSchema.prefault({}),
  // Prices are filled from published pricing in Slice 7, never guessed or treated as zero.
  prices: z.record(z.string().min(1), modelPriceSchema).default({}),
});
export type Config = z.infer<typeof configSchema>;
export const defaultConfig = configSchema.parse({});
