import type {
  ApplyDamageInput,
  AttackInput,
  AttackOutput,
  ContestedCheckInput,
  EpisodeSeed,
  GameEvent,
  EndCombatInput,
  EquipInput,
  HealInput,
  HideInput,
  MoveInput,
  OpenContainerInput,
  PassTurnInput,
  SearchInput,
  SkillCheckInput,
  ToolResult,
  TransferItemInput,
  UnequipInput,
  UnlockContainerInput,
} from '@dungeon/shared';
import { move } from './commands/move.js';
import { createEntities } from './commands/create_entities.js';
import type { EntityCreation } from './commands/create_entities.js';
import { skillCheck } from './commands/skill_check.js';
import { contestedCheck } from './commands/contested_check.js';
import { search } from './commands/search.js';
import { openContainer } from './commands/open_container.js';
import { unlockContainer } from './commands/unlock_container.js';
import { transferItem } from './commands/transfer_item.js';
import { equip } from './commands/equip.js';
import { unequip } from './commands/unequip.js';
import { hide } from './commands/hide.js';
import { applyDamage } from './commands/apply_damage.js';
import { heal } from './commands/heal.js';
import { attack } from './commands/attack.js';
import { startCombat } from './commands/start_combat.js';
import { endCombat } from './commands/end_combat.js';
import { passTurn } from './commands/pass_turn.js';
import { requireRule } from './errors.js';
import { eventDraft } from './events.js';
import type {
  CommandContext,
  CommandValue,
  EventDraft,
  PendingEvent,
} from './events.js';
import { receiptById } from './receipts.js';
import type { CheckReceipt } from './receipts.js';
import { beatSeed } from './rules/dice.js';
import { runCommand } from './transaction.js';
import type { CommandActor, CommandOptions } from './transaction.js';
import { createState } from './state.js';
import type { EngineState, WalkabilityGrid } from './state.js';
import { endCondition } from './endCondition.js';
import { reduceEvent } from './replay.js';

export type { CommandOptions } from './transaction.js';
export interface EngineSnapshot {
  state: EngineState;
  pendingEvents: PendingEvent[];
}

export class Engine {
  #state: EngineState;
  #pending: PendingEvent[] = [];
  #start: EngineSnapshot;

  constructor(seed: EpisodeSeed, grid: WalkabilityGrid, sessionSeed: string) {
    this.#state = createState(seed, grid, sessionSeed);
    this.#start = this.snapshot();
  }

  static fromLog(records: readonly GameEvent[], grid: WalkabilityGrid): Engine {
    const first = records[0];
    if (first?.type !== 'SeedLoaded')
      throw new Error('Engine replay requires SeedLoaded as the first record.');
    const engine = new Engine(first.payload.seed, grid, first.payload.rngSeed);
    for (const record of records)
      engine.#state = reduceEvent(engine.#state, record, grid);
    engine.#start = engine.snapshot();
    return engine;
  }

  get state(): EngineState {
    return structuredClone(this.#state);
  }

  snapshot(): EngineSnapshot {
    return structuredClone({
      state: this.#state,
      pendingEvents: this.#pending,
    });
  }

  restore(snapshot: EngineSnapshot): void {
    const copy = structuredClone(snapshot);
    this.#state = copy.state;
    this.#pending = copy.pendingEvents;
    this.#start = this.snapshot();
  }

  beginBeat(beat: number, attempt = 0): void {
    requireRule(
      Number.isSafeInteger(beat) &&
        beat >= 0 &&
        Number.isSafeInteger(attempt) &&
        attempt >= 0,
      'INVALID_BEAT',
      `${beat}/${attempt}: expected nonnegative integer beat and attempt.`,
    );
    this.#state.beat = beat;
    this.#state.attempt = attempt;
    this.#state.rngState = beatSeed(this.#state.rngSeed, beat, attempt);
    this.#state.receiptCounter = 0;
    this.#pending = [];
    // Retain older receipts to distinguish expired IDs from missing IDs.
    for (const [id, receipt] of this.#state.receipts)
      if (receipt.beat === beat) this.#state.receipts.delete(id);
    this.#start = this.snapshot();
  }

  rollback(): void {
    const start = structuredClone(this.#start);
    this.#state = start.state;
    this.#pending = start.pendingEvents;
  }

  collectEvents(): EventDraft[] {
    return structuredClone(
      this.#pending.map((event) => eventDraft(this.#state, event)),
    );
  }

  successfulReceipts(): readonly Readonly<CheckReceipt>[] {
    return structuredClone(
      [...this.#state.receipts.values()].filter(
        (receipt) =>
          receipt.beat === this.#state.beat &&
          receipt.outcome === 'success' &&
          !receipt.spent,
      ),
    );
  }

  endCondition() {
    return endCondition(this.#state);
  }

  #run<T>(
    command: string,
    handler: (ctx: CommandContext) => CommandValue<T>,
    options: CommandOptions,
    actor?: CommandActor,
  ): ToolResult<T, EventDraft> {
    const transaction = runCommand(
      this.#state,
      command,
      handler,
      options,
      actor,
    );
    if (!transaction.ok) return transaction;
    this.#state = transaction.state;
    this.#pending.push(...transaction.pending);
    return transaction.result;
  }

  move(input: MoveInput, options: CommandOptions = {}) {
    return this.#run('move', (ctx) => move(ctx, input), options, input.actor);
  }
  createEntities(inputs: readonly EntityCreation[]) {
    return this.#run(
      'createEntities',
      (ctx) => createEntities(ctx, inputs),
      {},
    );
  }
  skill_check(input: SkillCheckInput, options: CommandOptions = {}) {
    return this.#run(
      'skill_check',
      (ctx) => skillCheck(ctx, input),
      options,
      input.actor,
    );
  }
  contested_check(input: ContestedCheckInput, options: CommandOptions = {}) {
    return this.#run(
      'contested_check',
      (ctx) => contestedCheck(ctx, input),
      options,
      input.actor,
    );
  }
  search(input: SearchInput, options: CommandOptions = {}) {
    return this.#run(
      'search',
      (ctx) => search(ctx, input),
      options,
      input.actor,
    );
  }
  open_container(input: OpenContainerInput, options: CommandOptions = {}) {
    return this.#run(
      'open_container',
      (ctx) => openContainer(ctx, input),
      options,
      input.actor,
    );
  }
  unlock_container(input: UnlockContainerInput, options: CommandOptions = {}) {
    return this.#run(
      'unlock_container',
      (ctx) => unlockContainer(ctx, input),
      options,
      input.actor,
    );
  }
  transfer_item(input: TransferItemInput, options: CommandOptions = {}) {
    return this.#run(
      'transfer_item',
      (ctx) => transferItem(ctx, input),
      options,
      input.actor,
    );
  }
  equip(input: EquipInput, options: CommandOptions = {}) {
    return this.#run('equip', (ctx) => equip(ctx, input), options, input.actor);
  }
  unequip(input: UnequipInput, options: CommandOptions = {}) {
    return this.#run(
      'unequip',
      (ctx) => unequip(ctx, input),
      options,
      input.actor,
    );
  }
  hide(input: HideInput, options: CommandOptions = {}) {
    return this.#run('hide', (ctx) => hide(ctx, input), options, input.actor);
  }
  apply_damage(input: ApplyDamageInput, options: CommandOptions = {}) {
    return this.#run('apply_damage', (ctx) => applyDamage(ctx, input), options);
  }
  heal(input: HealInput, options: CommandOptions = {}) {
    return this.#run(
      'heal',
      (ctx) => heal(ctx, input),
      options,
      (state) =>
        typeof input.source === 'object'
          ? receiptById(state, input.source.checkId).actor
          : undefined,
    );
  }
  attack(
    input: AttackInput,
    options: CommandOptions = {},
  ): ToolResult<AttackOutput, EventDraft> {
    const started =
      this.#state.combat === null
        ? this.#run('start_combat', (ctx) => startCombat(ctx, input), options)
        : undefined;
    if (started && !started.ok) return started;
    const result = this.#run(
      'attack',
      (ctx) => attack(ctx, input),
      options,
      input.attacker,
    );
    if (!result.ok || !started) return result;
    return {
      ...result,
      events: [...started.events, ...result.events],
      facts: [...started.facts, ...result.facts],
    };
  }
  pass_turn(input: PassTurnInput, options: CommandOptions = {}) {
    return this.#run('pass_turn', (ctx) => passTurn(ctx, input), options);
  }
  end_combat(input: EndCombatInput, options: CommandOptions = {}) {
    return this.#run('end_combat', (ctx) => endCombat(ctx, input), options);
  }
}

export { EngineError } from './errors.js';
export { abilityModifier, skillAbilities } from './rules/checks.js';
export { beatSeed, hashSeed, parseDice, rollDice } from './rules/dice.js';
export type { RandomState } from './rules/dice.js';
export type { CheckReceipt } from './receipts.js';
export type { EventDraft } from './events.js';
export type { CombatState, EngineState, WalkabilityGrid } from './state.js';
export { endCondition } from './endCondition.js';
export { reduceEvent } from './replay.js';
