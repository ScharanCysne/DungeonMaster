import type { Ability, CharacterId, RollOutcome, Skill } from '@dungeon/shared';
import { EngineError, requireRule } from './errors.js';
import type { EngineState } from './state.js';

export interface CheckReceipt {
  id: string;
  actor: CharacterId;
  skill?: Skill;
  ability?: Ability;
  total: number;
  outcome: RollOutcome;
  beat: number;
  spent: boolean;
  target?: CharacterId;
  targetSkill?: Skill;
  winner?: CharacterId | null;
}

export function issueReceipt(
  state: EngineState,
  check: Omit<CheckReceipt, 'id' | 'beat' | 'spent'>,
): CheckReceipt {
  const id = `chk_${state.beat}_${++state.receiptCounter}`;
  const receipt = { ...check, id, beat: state.beat, spent: false };
  state.receipts.set(id, receipt);
  return receipt;
}

export function receiptById(
  state: EngineState,
  id: string | undefined,
): CheckReceipt {
  requireRule(
    id !== undefined,
    'RECEIPT_REQUIRED',
    `${String(id)}: expected a checkId from beat ${state.beat}.`,
  );
  const receipt = id === undefined ? undefined : state.receipts.get(id);
  if (!receipt)
    throw new EngineError(
      'RECEIPT_INVALID',
      `${String(id)}: expected an existing receipt from beat ${state.beat}.`,
    );
  requireRule(
    receipt.beat === state.beat,
    'RECEIPT_INVALID',
    `${receipt.id}: expected beat ${state.beat}, got ${receipt.beat}.`,
  );
  return receipt;
}

export function spendReceipt(
  state: EngineState,
  id: string | undefined,
  actor: CharacterId,
  skills: readonly Skill[],
  minimum?: number,
): CheckReceipt {
  const receipt = receiptById(state, id);
  requireRule(
    receipt.actor === actor,
    'RECEIPT_WRONG_ACTOR',
    `${receipt.id}: actor ${receipt.actor}; expected ${actor}.`,
  );
  requireRule(
    !receipt.spent,
    'RECEIPT_SPENT',
    `${receipt.id}: expected an unspent receipt.`,
  );
  requireRule(
    receipt.outcome === 'success' &&
      (receipt.target === undefined || receipt.winner === actor),
    'RECEIPT_FAILED',
    `${receipt.id}: expected a successful check won by ${actor}, got ${receipt.outcome}.`,
  );
  requireRule(
    receipt.skill !== undefined && skills.includes(receipt.skill),
    'RECEIPT_WRONG_SKILL',
    `${receipt.id}: skill ${receipt.skill ?? receipt.ability}; expected ${skills.join(' or ')}.`,
  );
  requireRule(
    minimum === undefined || receipt.total >= minimum,
    'RECEIPT_FAILED',
    `${receipt.id}: total ${receipt.total}; expected at least ${minimum}.`,
  );
  receipt.spent = true;
  return receipt;
}
