import { raritySchema, slugify } from '@dungeon/shared';
import type { z } from 'zod';
import type {
  EntityId,
  GeneratedFact,
  GeneratedItem,
  GeneratedNpc,
  GenerateItemInput,
} from '@dungeon/shared';
import type { GraphNode } from '../../ontology/mutations.js';
import type { BeatContext } from '../tools/BeatContext.js';
import { graphLocation, normalizedTag } from './context.js';
import type { GenerationContext } from './context.js';

export class GenerationProblems extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('; '));
  }
}

export function parseAt<T>(
  schema: z.ZodType<T>,
  value: unknown,
  path: string,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new GenerationProblems(
      parsed.error.issues.map(
        (issue) => `${[path, ...issue.path].join('.')}: ${issue.message}`,
      ),
    );
  return parsed.data;
}

export function requireGeneration(condition: boolean, problem: string): void {
  if (!condition) throw new GenerationProblems([problem]);
}

export function referencesValid(
  ids: readonly EntityId[],
  context: GenerationContext,
): void {
  const problems = ids
    .filter((id) => !context.nodes.some((node) => node.id === id))
    .map((id) => `${id}: referenced entity does not exist.`);
  if (problems.length) throw new GenerationProblems(problems);
}

export function factReferences(
  facts: readonly GeneratedFact[],
  context: GenerationContext,
): void {
  referencesValid(
    facts.flatMap((fact) => fact.about),
    context,
  );
  for (const fact of facts)
    for (const id of fact.about)
      requireGeneration(
        !context.nodes.some(
          (node) =>
            node.id === id && 'questCritical' in node && node.questCritical,
        ),
        `${id}: facts about quest-critical items may only come from the seed.`,
      );
}

export function entityKind(node: GraphNode): string {
  if ('questCritical' in node) return 'item';
  if ('role' in node) return 'npc';
  if ('locked' in node) return 'feature';
  if ('statement' in node) return `fact:${node.kind}`;
  return node.id.split(':')[0] ?? '';
}

export function duplicateProblems(
  name: string,
  tags: readonly string[],
  kind: string,
  context: GenerationContext,
  extra: readonly GraphNode[] = [],
): string[] {
  const a = new Set(tags.map(normalizedTag).filter(Boolean));
  const problems: string[] = [];
  for (const node of [...context.nodes, ...extra]) {
    if ('seq' in node) continue;
    const existingName =
      kind.startsWith('fact:') && 'statement' in node
        ? node.statement
        : node.name;
    if (slugify(existingName) === slugify(name))
      problems.push(`Name "${name}" duplicates ${node.id}.`);
    const location = extra.includes(node)
      ? context.locationId
      : graphLocation(node.id, context.nodes, context.edges);
    if (
      kind !== entityKind(node) ||
      !location ||
      location !== context.locationId
    )
      continue;
    const b = new Set(node.tags.map(normalizedTag).filter(Boolean));
    const union = new Set([...a, ...b]).size;
    const overlap = [...a].filter((tag) => b.has(tag)).length;
    if (union > 0 && overlap / union >= 0.8)
      problems.push(
        `Tags duplicate ${node.id}: Jaccard ${overlap / union} >= 0.8 in ${location}.`,
      );
  }
  return problems;
}

export function itemProblems(
  raw: GeneratedItem,
  ctx: BeatContext,
  constraints?: GenerateItemInput['constraints'],
): string[] {
  const { item } = raw;
  const rarity = raritySchema.options;
  const max = Math.min(
    rarity.indexOf(ctx.limits.generatedItemMaxRarity),
    rarity.indexOf(constraints?.maxRarity ?? 'legendary'),
  );
  const problems: string[] = [];
  if (rarity.indexOf(item.rarity) > max)
    problems.push(`item.rarity ${item.rarity}: maximum ${rarity[max]}.`);
  if (item.value > ctx.limits.generatedItemMaxValueGp)
    problems.push(
      `item.value ${item.value}: maximum ${ctx.limits.generatedItemMaxValueGp} gp.`,
    );
  if (constraints?.kind && constraints.kind !== item.kind)
    problems.push(`item.kind: expected ${constraints.kind}.`);
  return problems;
}

export function npcProblems(
  raw: GeneratedNpc,
  ctx: BeatContext,
  context: GenerationContext,
): string[] {
  const problems: string[] = [];
  const bounds = ctx.config.generatorStats;
  for (const [name, value] of Object.entries(raw.npc.abilities))
    if (value < bounds.abilityMin || value > bounds.abilityMax)
      problems.push(
        `npc.abilities.${name} ${value}: expected ${bounds.abilityMin}..${bounds.abilityMax}.`,
      );
  for (const [name, value, min, max] of [
    ['hp', raw.npc.hp, bounds.hpMin, bounds.hpMax],
    ['maxHp', raw.npc.maxHp, bounds.hpMin, bounds.hpMax],
    ['ac', raw.npc.ac, bounds.acMin, bounds.acMax],
  ] as const)
    if (value < min || value > max)
      problems.push(`npc.${name} ${value}: expected ${min}..${max}.`);
  if (raw.npc.hp > raw.npc.maxHp || raw.npc.conscious !== raw.npc.hp > 0)
    problems.push('npc: HP/maxHp/consciousness are inconsistent.');
  const count = context.nodes.filter(
    (node) =>
      'role' in node &&
      node.role === 'npc' &&
      node.createdBy.startsWith('generator:'),
  ).length;
  if (count >= ctx.limits.newNpcsPerEpisode)
    problems.push(
      `NPC limit ${ctx.limits.newNpcsPerEpisode} per episode reached (${count} generated NPCs).`,
    );
  return problems;
}
