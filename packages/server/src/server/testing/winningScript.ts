import { ScriptedProvider } from '../../agents/llm/ScriptedProvider.js';
import { Engine } from '../../engine/index.js';
import {
  accepted,
  calls,
  content,
  narrate,
  pass,
} from '../../beat/testing/harness.js';

export function winningScript() {
  const actor = 'char:ilsa';
  const check = {
    actor,
    skill: 'investigation',
    dc: 15,
    advantage: 'advantage',
    reason: 'Find the old barrel.',
  } as const;
  let sessionSeed = '';
  for (let index = 0; index < 100; index++) {
    const candidate = `server-win-${index}`;
    const engine = new Engine(content.seed, content.grid, candidate);
    engine.beginBeat(3);
    const result = engine.skill_check(check);
    if (result.ok && result.value.outcome === 'success') {
      sessionSeed = candidate;
      break;
    }
  }
  if (!sessionSeed) throw new Error('Missing deterministic winning seed');
  const provider = new ScriptedProvider({
    peer: Array.from({ length: 6 }, () => pass),
    dm: [
      calls(narrate),
      calls(narrate),
      calls(
        { name: 'move', input: { actor, to: 'char:brann' } },
        {
          name: 'transfer_item',
          input: {
            actor,
            item: 'item:iron-key',
            to: actor,
            reason: 'buy',
            price: 0,
          },
        },
        { name: 'move', input: { actor, to: 'loc:kitchen' } },
        { name: 'skill_check', input: check },
        {
          name: 'search',
          input: { actor, area: 'loc:kitchen', checkId: 'chk_3_1' },
        },
        {
          name: 'unlock_container',
          input: {
            actor,
            container: 'container:old-barrel',
            method: 'key',
            itemId: 'item:iron-key',
          },
        },
        {
          name: 'open_container',
          input: { actor, container: 'container:old-barrel' },
        },
        {
          name: 'transfer_item',
          input: { actor, item: 'item:quill', to: actor, reason: 'pick_up' },
        },
        narrate,
      ),
    ],
    critic: [accepted, accepted, accepted],
  });
  return { provider, sessionSeed };
}

export function forbiddenSeedStrings() {
  return [
    ...[
      ...content.seed.characters,
      ...content.seed.containers,
      ...content.seed.items,
    ]
      .filter(({ hidden }) => hidden)
      .map(({ id }) => id),
    ...content.seed.facts
      .filter(
        (fact) =>
          !fact.knownBy.some(({ character }) => character === 'char:kael'),
      )
      .flatMap(({ id, statement }) => [id, statement]),
    'groundTruth',
    ...content.seed.characters
      .filter(({ role }) => role !== 'player')
      .flatMap(({ background, personality }) => [background, personality]),
  ];
}
