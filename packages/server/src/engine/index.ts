import type {
  ApplyDamageInput,
  ContestedCheckInput,
  EpisodeSeed,
  EquipInput,
  HealInput,
  HideInput,
  MoveInput,
  OpenContainerInput,
  SearchInput,
  SkillCheckInput,
  ToolResult,
  TransferItemInput,
  UnequipInput,
  UnlockContainerInput,
} from '@dungeon/shared';
import { move } from './commands/move.js';
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
import { EngineError, requireRule } from './errors.js';
import { eventDraft } from './events.js';
import type {
  CommandContext,
  CommandValue,
  EventDraft,
  PendingEvent,
} from './events.js';
import { protectQuestItems } from './questItems.js';
import type { CheckReceipt } from './receipts.js';
import { beatSeed } from './rules/dice.js';
import { witnessCandidates } from './rules/perception.js';
import { createState } from './state.js';
import type { EngineState, WalkabilityGrid } from './state.js';
import { endCondition } from './endCondition.js';

export interface CommandOptions {
  private?: boolean;
}
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

  get state(): EngineState {
    return structuredClone(this.#state);
  }

  snapshot(): EngineSnapshot {
    return structuredClone({
      state: this.#state,
      pendingEvents: this.#pending,
    });
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
  ): ToolResult<T, EventDraft> {
    const state = structuredClone(this.#state);
    const emitted: Omit<PendingEvent, 'candidateWitnesses'>[] = [];
    try {
      const result = handler({
        state,
        emit: (body, actor, locationId, targets = []) => {
          emitted.push({
            body,
            context: {
              actor,
              locationId,
              targets,
              private: options.private ?? false,
            },
          });
        },
      });
      protectQuestItems(this.#state, state, command);
      const pending = emitted.map((event) => ({
        ...event,
        candidateWitnesses: witnessCandidates(state, event.context),
      }));
      const events = pending.map((event) => eventDraft(state, event));
      this.#state = state;
      this.#pending.push(...structuredClone(pending));
      return structuredClone({ ok: true, ...result, events });
    } catch (error) {
      if (error instanceof EngineError)
        return {
          ok: false,
          error: { code: error.code, message: error.message },
        };
      throw error;
    }
  }

  move(input: MoveInput, options: CommandOptions = {}) {
    return this.#run('move', (ctx) => move(ctx, input), options);
  }
  skill_check(input: SkillCheckInput, options: CommandOptions = {}) {
    return this.#run('skill_check', (ctx) => skillCheck(ctx, input), options);
  }
  contested_check(input: ContestedCheckInput, options: CommandOptions = {}) {
    return this.#run(
      'contested_check',
      (ctx) => contestedCheck(ctx, input),
      options,
    );
  }
  search(input: SearchInput, options: CommandOptions = {}) {
    return this.#run('search', (ctx) => search(ctx, input), options);
  }
  open_container(input: OpenContainerInput, options: CommandOptions = {}) {
    return this.#run(
      'open_container',
      (ctx) => openContainer(ctx, input),
      options,
    );
  }
  unlock_container(input: UnlockContainerInput, options: CommandOptions = {}) {
    return this.#run(
      'unlock_container',
      (ctx) => unlockContainer(ctx, input),
      options,
    );
  }
  transfer_item(input: TransferItemInput, options: CommandOptions = {}) {
    return this.#run(
      'transfer_item',
      (ctx) => transferItem(ctx, input),
      options,
    );
  }
  equip(input: EquipInput, options: CommandOptions = {}) {
    return this.#run('equip', (ctx) => equip(ctx, input), options);
  }
  unequip(input: UnequipInput, options: CommandOptions = {}) {
    return this.#run('unequip', (ctx) => unequip(ctx, input), options);
  }
  hide(input: HideInput, options: CommandOptions = {}) {
    return this.#run('hide', (ctx) => hide(ctx, input), options);
  }
  apply_damage(input: ApplyDamageInput, options: CommandOptions = {}) {
    return this.#run('apply_damage', (ctx) => applyDamage(ctx, input), options);
  }
  heal(input: HealInput, options: CommandOptions = {}) {
    return this.#run('heal', (ctx) => heal(ctx, input), options);
  }
}

export { EngineError } from './errors.js';
export { abilityModifier, skillAbilities } from './rules/checks.js';
export { beatSeed, hashSeed, parseDice, rollDice } from './rules/dice.js';
export type { RandomState } from './rules/dice.js';
export type { CheckReceipt } from './receipts.js';
export type { EventDraft } from './events.js';
export type { EngineState, WalkabilityGrid } from './state.js';
export { endCondition } from './endCondition.js';
