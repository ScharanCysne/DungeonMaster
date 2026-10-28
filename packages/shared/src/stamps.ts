import type { CheckRolledPayload, EventPayload } from './event-payloads.js';

export type NameLookup = (id: string) => string | undefined;

function skillName(skill: string): string {
  return skill
    .split('_')
    .map((word) =>
      word === 'of' ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}

export function formatRollStamp(
  payload: CheckRolledPayload | EventPayload<'AttackResolved'>,
  lookup: NameLookup,
): string {
  const name = (id: string) => lookup(id) ?? id;
  if ('attacker' in payload) {
    const { attacker, target, roll, hit, critical } = payload;
    const ac = roll.dc === undefined ? '' : ` vs AC ${roll.dc}`;
    return `${name(attacker)} attacks ${name(target)} · ${roll.total}${ac} → ${hit ? `hit${critical ? ' (critical)' : ''}` : 'miss'}`;
  }
  if (payload.kind === 'contested') {
    const actor = `${name(payload.actor)} · ${skillName(payload.skill)} ${payload.actorRoll.total}`;
    const target = `${name(payload.target)} · ${skillName(payload.targetSkill)} ${payload.targetRoll.total}`;
    const outcome =
      payload.winner === null ? 'tie' : `${name(payload.winner)} wins`;
    return `${actor} vs ${target} → ${outcome}`;
  }
  const { actor, skill, ability, dc, roll, advantage } = payload;
  const label = skill === undefined ? ability?.toUpperCase() : skillName(skill);
  const dice =
    advantage !== 'none' && roll.rolls.length
      ? ` (${advantage}: ${roll.rolls.join(', ')})`
      : '';
  return `${name(actor)} · ${label} ${roll.total} vs DC ${dc} → ${roll.outcome}${dice}`;
}
