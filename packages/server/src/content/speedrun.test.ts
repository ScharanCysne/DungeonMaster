import { describe, expect, it } from 'vitest';
import type { Dc, Skill } from '@dungeon/shared';
import { Engine } from '../engine/index.js';
import { value } from '../engine/testing/fixtures.js';
import { loadEpisode } from './index.js';

const content = await loadEpisode();
const actor = 'char:kael';

function successfulCheck(
  engine: Engine,
  beat: number,
  skill: Skill,
  dc: Dc,
): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    engine.beginBeat(beat, attempt);
    const check = value(
      engine.skill_check({
        actor,
        skill,
        dc,
        advantage: 'none',
        reason: `Episode N: ${skill}`,
      }),
    );
    if (check.outcome === 'success') return check.checkId;
    engine.rollback();
  }
  throw new Error(
    `No successful ${skill} check in 100 deterministic attempts.`,
  );
}

function discoverBarrel(engine: Engine) {
  expect(value(engine.move({ actor, to: 'loc:kitchen' })).to).toBe(
    'loc:kitchen',
  );
  const checkId = successfulCheck(engine, 3, 'investigation', 15);
  expect(
    value(engine.search({ actor, area: 'loc:kitchen', checkId })).revealed,
  ).toContain('container:old-barrel');
  expect(engine.state.items.get('item:quill')?.hidden).toBe(true);
  expect(
    engine.open_container({ actor, container: 'container:old-barrel' }),
  ).toMatchObject({ ok: false, error: { code: 'CONTAINER_LOCKED' } });
}

function takeQuill(engine: Engine) {
  expect(engine.endCondition()).toBeNull();
  expect(
    engine.transfer_item({
      actor,
      item: 'item:quill',
      to: actor,
      reason: 'pick_up',
    }),
  ).toMatchObject({ ok: false, error: { code: 'CONTAINER_CLOSED' } });
  value(engine.open_container({ actor, container: 'container:old-barrel' }));
  value(
    engine.transfer_item({
      actor,
      item: 'item:quill',
      to: actor,
      reason: 'pick_up',
    }),
  );
  expect(engine.state.items.get('item:quill')?.holder).toEqual({
    kind: 'character',
    id: actor,
  });
  expect(engine.endCondition()).toBe(actor);
}

function fightForKey(engine: Engine) {
  engine.beginBeat(2);
  const first = engine.attack({
    attacker: actor,
    target: 'char:brann',
    weaponId: 'item:longbow',
  });
  if (!first.ok) expect(first.error.code).toBe('NOT_YOUR_TURN');
  for (
    let turn = 0;
    turn < 100 && engine.state.characters.get('char:brann')?.conscious;
    turn++
  ) {
    const combat = engine.state.combat;
    if (!combat) throw new Error('Expected active bar combat.');
    const current = combat.order[combat.turn];
    if (current === actor)
      value(
        engine.attack({
          attacker: actor,
          target: 'char:brann',
          weaponId: 'item:longbow',
        }),
      );
    else if (current === 'char:brann')
      value(engine.attack({ attacker: current, target: actor }));
    else throw new Error(`Unexpected combatant ${current}.`);
  }
  expect(engine.state.characters.get('char:brann')?.conscious).toBe(false);
  value(engine.end_combat({ reason: 'defeated' }));
  value(
    engine.transfer_item({
      actor,
      item: 'item:iron-key',
      to: actor,
      reason: 'loot',
    }),
  );
}

describe('Episode N scripted solutions', () => {
  it.each(['steal', 'buy', 'fight'] as const)(
    'finds the letter, obtains the key via %s and takes the quill',
    (route) => {
      const engine = new Engine(
        content.seed,
        content.grid,
        'episode-n-speedrun',
      );
      expect(engine.endCondition()).toBeNull();
      const checkId = successfulCheck(engine, 1, 'investigation', 10);
      expect(
        value(engine.search({ actor, area: 'loc:common-room', checkId }))
          .revealed,
      ).toContain('container:floorboard');
      value(
        engine.open_container({ actor, container: 'container:floorboard' }),
      );
      value(
        engine.transfer_item({
          actor,
          item: 'item:wax-letter',
          to: actor,
          reason: 'pick_up',
        }),
      );
      expect(engine.state.items.get('item:wax-letter')?.holder.id).toBe(actor);
      expect(value(engine.move({ actor, to: 'char:brann' })).to).toBe(
        'loc:bar',
      );
      if (route === 'steal') {
        const checkId = successfulCheck(engine, 2, 'sleight_of_hand', 15);
        value(
          engine.transfer_item({
            actor,
            item: 'item:iron-key',
            to: actor,
            reason: 'steal',
            checkId,
          }),
        );
        expect(engine.state.receipts.get(checkId)?.spent).toBe(true);
      } else if (route === 'buy') {
        value(
          engine.transfer_item({
            actor,
            item: 'item:iron-key',
            to: actor,
            reason: 'buy',
            price: 10,
          }),
        );
        expect(engine.state.characters.get(actor)?.gold).toBe(24);
      } else fightForKey(engine);
      discoverBarrel(engine);
      value(
        engine.unlock_container({
          actor,
          container: 'container:old-barrel',
          method: 'key',
          itemId: 'item:iron-key',
        }),
      );
      takeQuill(engine);
      const events = engine.collectEvents();
      expect(
        events.some(
          (event) =>
            event.type === 'EntityRevealed' &&
            event.payload.entityId === 'container:old-barrel',
        ),
      ).toBe(true);
      expect(
        events.some(
          (event) =>
            event.type === 'ItemTransferred' &&
            event.payload.itemId === 'item:quill',
        ),
      ).toBe(true);
    },
  );
  it.each([
    ['lockpick', 'sleight_of_hand'],
    ['force', 'athletics'],
  ] as const)(
    'reaches the quill by %s without Brann’s key',
    (method, skill) => {
      const engine = new Engine(
        content.seed,
        content.grid,
        'episode-n-alternative',
      );
      engine.beginBeat(1);
      discoverBarrel(engine);
      const checkId = successfulCheck(engine, 4, skill, 15);
      value(
        engine.unlock_container({
          actor,
          container: 'container:old-barrel',
          method,
          checkId,
        }),
      );
      takeQuill(engine);
      expect(engine.state.items.get('item:iron-key')?.holder.id).toBe(
        'char:brann',
      );
    },
  );
  it('uses each real healing potion as a consumable with explicit healing dice', () => {
    const engine = new Engine(content.seed, content.grid, 'episode-n-healing');
    engine.beginBeat(1);
    for (const source of ['item:potion-1', 'item:potion-2'] as const) {
      const healed = value(
        engine.heal({ target: 'char:mael', source, dice: '2d4+2' }),
      );
      expect(healed.amount).toBeGreaterThan(0);
      expect(engine.state.items.has(source)).toBe(false);
    }
  });
});
