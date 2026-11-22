import { factSchema, itemSchema, uniqueId } from '@dungeon/shared';
import type {
  CharacterId,
  CreatedBy,
  EntityId,
  EventPayload,
  Fact,
  GeneratedFact,
  GeneratedItem,
  GenerateItemInput,
  Holder,
  ItemId,
  SpriteManifest,
  SlugLabel,
} from '@dungeon/shared';
import type { EntityCreation } from '../../engine/commands/create_entities.js';
import type { LogDraft } from '../../ontology/eventLog.js';
import type { GraphNode } from '../../ontology/mutations.js';
import type { BeatContext } from '../tools/BeatContext.js';
import type { GenerationContext } from './context.js';
import { factIdentity } from './factIdentity.js';
import { catalogueMatch, selectSprite } from './sprites.js';
import {
  duplicateProblems,
  factReferences,
  GenerationProblems,
  itemProblems,
  parseAt,
  requireGeneration,
} from './validation.js';

export interface Registration<T> {
  creations: EntityCreation[];
  events: LogDraft[];
  describe: string[];
  resolve(created: EventPayload<'EntityCreated'>[]): T;
  story?: { facts: Fact[]; basedOn: Fact[] };
}

export class Registrar {
  readonly creations: EntityCreation[] = [];
  readonly events: LogDraft[] = [];
  readonly staged: GraphNode[] = [];
  readonly ids: Set<string>;
  constructor(
    readonly ctx: BeatContext,
    readonly context: GenerationContext,
    readonly sprites: SpriteManifest,
  ) {
    this.ids = new Set(context.nodes.map((node) => node.id));
  }
  id<L extends SlugLabel>(label: L, name: string) {
    const id = uniqueId(label, name, this.ids);
    this.ids.add(id);
    return id;
  }
  provenance(createdBy: CreatedBy) {
    return { createdBy, createdAtBeat: this.ctx.beat };
  }
  sprite(tags: string[], kind: keyof SpriteManifest['fallbacks'], id: string) {
    if (kind !== 'npc')
      requireGeneration(
        catalogueMatch(tags, this.sprites) !== undefined,
        `${id}.tags: include at least one catalogue tag naming the object's category.`,
      );
    const reserved = new Set(
      [...this.ctx.engine.state.items]
        .filter(([, item]) => item.questCritical)
        .flatMap(([itemId]) => this.sprites.overrides[itemId] ?? []),
    );
    return selectSprite(tags, kind, id, this.sprites, reserved).sprite;
  }
  unique(name: string, tags: string[], kind: string) {
    const problems = duplicateProblems(
      name,
      tags,
      kind,
      this.context,
      this.staged,
    );
    if (problems.length) throw new GenerationProblems(problems);
  }
  fact(
    raw: GeneratedFact,
    createdBy: CreatedBy,
    about: EntityId[] = [],
    originOf: (ItemId | CharacterId)[] = [],
    secretOf?: CharacterId,
  ) {
    factReferences([raw], this.context);
    const identity = factIdentity(raw.statement, this.ids);
    this.ids.add(identity.id);
    const fact = factSchema.parse({
      ...identity,
      summary: raw.statement,
      tags: [],
      statement: raw.statement,
      truth: raw.truth,
      kind: raw.kind,
      ...this.provenance(createdBy),
    });
    this.events.push({
      type: 'FactCreated',
      payload: {
        fact,
        about: [...new Set([...raw.about, ...about])],
        originOf,
        ...(secretOf ? { secretOf } : {}),
      },
      actor: null,
      private: true,
      witnesses: secretOf ? [secretOf] : [],
      createdBy,
    });
    if (secretOf)
      this.events.push({
        type: 'FactLearned',
        payload: {
          characterId: secretOf,
          factId: fact.id,
          since: this.ctx.beat,
          source: 'deduced',
          confidence: 1,
        },
        actor: secretOf,
        private: true,
        witnesses: [secretOf],
        createdBy,
      });
    return fact;
  }
  item(
    raw: GeneratedItem,
    holder: Holder,
    constraints?: GenerateItemInput['constraints'],
  ) {
    const problems = itemProblems(raw, this.ctx, constraints);
    if (problems.length) throw new GenerationProblems(problems);
    this.unique(raw.item.name, raw.item.tags, 'item');
    const id = this.id('item', raw.item.name);
    const item = parseAt(
      itemSchema,
      {
        ...raw.item,
        id,
        ...this.provenance('generator:item'),
        questCritical: false,
        sprite: this.sprite(raw.item.tags, raw.item.kind, id),
      },
      'item',
    );
    this.staged.push(item);
    this.creations.push({ kind: 'item', entity: item, holder });
    const backstory = raw.backstory.map((fact) =>
      this.fact(fact, 'generator:item', [item.id], [item.id]),
    );
    return { item, backstory };
  }
  plan<T>(value: T, describe: string[]): Registration<T> {
    return {
      creations: this.creations,
      events: this.events,
      describe,
      resolve: () => value,
    };
  }
}
