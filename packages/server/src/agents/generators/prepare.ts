import {
  characterSchema,
  containerSchema,
  generateItemOutputSchema,
  generateNpcOutputSchema,
  generateStoryOutputSchema,
  generateFeatureOutputSchema,
  edgeSchemas,
} from '@dungeon/shared';
import type {
  EventPayload,
  GeneratedNpc,
  GeneratedFeature,
  GeneratedStory,
  GeneratedItem,
  GenerateNpcInput,
  GenerateFeatureInput,
  GenerateStoryInput,
  GenerateItemInput,
  Holder,
} from '@dungeon/shared';
import { Registrar } from './registration.js';
import {
  factReferences,
  GenerationProblems,
  npcProblems,
  parseAt,
  referencesValid,
  requireGeneration,
} from './validation.js';

export function prepareItem(
  raw: GeneratedItem,
  input: GenerateItemInput,
  r: Registrar,
) {
  const node = r.context.nodes.find((node) => node.id === input.placement);
  let holder: Holder;
  if (node && 'role' in node) holder = { kind: 'character', id: node.id };
  else if (node && 'locked' in node)
    holder = { kind: 'container', id: node.id };
  else if (node && 'tileBounds' in node)
    holder = { kind: 'location', id: node.id };
  else
    throw new GenerationProblems([
      `${input.placement}: expected an existing holder.`,
    ]);
  const value = generateItemOutputSchema.parse(
    r.item(raw, holder, input.constraints),
  );
  return r.plan(value, [
    `${value.item.name}: ${value.item.summary} Placed in ${input.placement}.`,
  ]);
}

export function prepareNpc(
  raw: GeneratedNpc,
  input: GenerateNpcInput,
  r: Registrar,
) {
  referencesValid(
    [input.locationId, ...raw.attitudes.map((attitude) => attitude.to)],
    r.context,
  );
  const problems = npcProblems(raw, r.ctx, r.context);
  if (problems.length) throw new GenerationProblems(problems);
  r.unique(raw.npc.name, raw.npc.tags, 'npc');
  const id = r.id('char', raw.npc.name);
  const npc = parseAt(
    characterSchema,
    {
      ...raw.npc,
      id,
      ...r.provenance('generator:npc'),
      sprite: r.sprite(raw.npc.tags, 'npc', id),
    },
    'npc',
  );
  r.staged.push(npc);
  const targets = raw.attitudes.map((attitude) => attitude.to);
  requireGeneration(
    new Set(targets).size === targets.length,
    'attitudes: each target must appear once.',
  );
  const attitudes = raw.attitudes.map(({ to, value, reason }) =>
    edgeSchemas.ATTITUDE.parse({
      type: 'ATTITUDE',
      from: npc.id,
      to,
      properties: { value, reason },
      ...r.provenance('generator:npc'),
    }),
  );
  r.creations.push({
    kind: 'npc',
    entity: npc,
    locationId: input.locationId,
    edges: attitudes,
  });
  const secret = r.fact(raw.secret, 'generator:npc', [npc.id], [], npc.id);
  const startingItems = (raw.startingItems ?? []).map((item) =>
    r.item(item, { kind: 'character', id: npc.id }),
  );
  const value = generateNpcOutputSchema.parse({
    npc,
    secret,
    attitudes,
    startingItems,
  });
  return r.plan(value, [
    `${npc.name}: ${npc.summary} Arrived in ${input.locationId}.`,
  ]);
}

export function prepareFeature(
  raw: GeneratedFeature,
  input: GenerateFeatureInput,
  r: Registrar,
) {
  referencesValid([input.locationId], r.context);
  r.unique(raw.name, raw.tags, 'feature');
  requireGeneration(
    input.hidden === undefined || raw.hidden === input.hidden,
    `hidden: expected ${input.hidden}.`,
  );
  requireGeneration(
    input.locked === undefined || raw.locked === input.locked,
    `locked: expected ${input.locked}.`,
  );
  requireGeneration(
    !raw.hidden || raw.findDc !== undefined,
    'hidden features require findDc.',
  );
  requireGeneration(
    !raw.locked || raw.lockDc !== undefined,
    'locked features require lockDc.',
  );
  const id = r.id('container', raw.name);
  const feature = containerSchema.parse({
    ...raw,
    id,
    ...r.provenance('generator:feature'),
    sprite: r.sprite(raw.tags, 'container', id),
  });
  r.creations.push({
    kind: 'feature',
    entity: feature,
    locationId: input.locationId,
  });
  const value = generateFeatureOutputSchema.parse(feature);
  return {
    ...r.plan(value, [
      `${feature.name}: ${feature.summary} Empty and closed in ${input.locationId}.`,
    ]),
    resolve: (created: EventPayload<'EntityCreated'>[]) => {
      const position = created[0]?.position;
      return { ...value, tile: position?.tile ?? value.tile };
    },
  };
}

export function prepareStory(
  raw: GeneratedStory,
  input: GenerateStoryInput,
  r: Registrar,
) {
  referencesValid(input.about, r.context);
  const facts = raw.facts.map((fact) => {
    requireGeneration(
      fact.kind === input.kind,
      `facts.kind: expected ${input.kind}.`,
    );
    r.unique(fact.statement, [], `fact:${fact.kind}`);
    const about = [...new Set([...fact.about, ...input.about])];
    factReferences([{ ...fact, about }], r.context);
    const originOf =
      input.kind === 'backstory'
        ? r.context.nodes.flatMap((node) =>
            about.includes(node.id) &&
            ('role' in node || 'questCritical' in node)
              ? [node.id]
              : [],
          )
        : [];
    const registered = r.fact(fact, 'generator:story', about, originOf);
    r.staged.push(registered);
    return registered;
  });
  const value = generateStoryOutputSchema.parse({ facts });
  return {
    ...r.plan(
      value,
      facts.map((fact) => fact.statement),
    ),
    story: { facts, basedOn: r.context.basedOn },
  };
}
