import { describe, expect, it } from 'vitest';
import type { Skill, ToolResult } from '@dungeon/shared';
import type { Engine, EventDraft } from './index.js';
import { entry, fixture, receipt, rejects, value } from './testing/fixtures.js';

const consumers: {
  name: string;
  skill: Skill;
  run: (engine: Engine, checkId: string) => ToolResult<unknown, EventDraft>;
}[] = [
  {
    name: 'hide',
    skill: 'stealth',
    run: (engine, checkId) => engine.hide({ actor: 'char:player', checkId }),
  },
  {
    name: 'search',
    skill: 'perception',
    run: (engine, checkId) =>
      engine.search({ actor: 'char:player', area: 'loc:room', checkId }),
  },
  {
    name: 'lockpick',
    skill: 'sleight_of_hand',
    run: (engine, checkId) =>
      engine.unlock_container({
        actor: 'char:player',
        container: 'container:lockbox',
        method: 'lockpick',
        checkId,
      }),
  },
  {
    name: 'force',
    skill: 'athletics',
    run: (engine, checkId) =>
      engine.unlock_container({
        actor: 'char:player',
        container: 'container:lockbox',
        method: 'force',
        checkId,
      }),
  },
  {
    name: 'steal',
    skill: 'sleight_of_hand',
    run: (engine, checkId) =>
      engine.transfer_item({
        actor: 'char:player',
        item: 'item:goods',
        to: 'char:player',
        reason: 'steal',
        checkId,
      }),
  },
  {
    name: 'heal',
    skill: 'medicine',
    run: (engine, checkId) =>
      engine.heal({ target: 'char:player', dice: '1d4', source: { checkId } }),
  },
];

describe('receipts', () => {
  it('numbers receipts within each beat using chk_beat_n', () => {
    const engine = fixture();
    const first = receipt(engine);
    const second = receipt(engine);
    engine.beginBeat(2);
    expect([first, second, receipt(engine)]).toEqual([
      'chk_1_1',
      'chk_1_2',
      'chk_2_1',
    ]);
  });
  it('lists only this beat’s successful unspent receipts', () => {
    const engine = fixture();
    receipt(engine);
    engine.beginBeat(2);
    const spent = receipt(engine);
    value(engine.hide({ actor: 'char:player', checkId: spent }));
    const unspent = receipt(engine);
    expect(engine.successfulReceipts().map((check) => check.id)).toEqual([
      unspent,
    ]);
  });
  it('returns detached receipt records so callers cannot mutate engine state', () => {
    const engine = fixture();
    receipt(engine);
    const before = engine.snapshot();
    const record = engine.successfulReceipts()[0];
    if (record) Object.assign(record, { spent: true });
    expect(engine.snapshot()).toEqual(before);
  });
  for (const consumer of consumers) {
    it(`${consumer.name} rejects an unknown receipt without changes`, () => {
      const engine = fixture();
      rejects(
        engine,
        () => consumer.run(engine, 'missing-check'),
        'RECEIPT_INVALID',
        'missing-check',
      );
    });
    it(`${consumer.name} rejects a receipt from another beat without changes`, () => {
      const engine = fixture();
      const checkId = receipt(engine, consumer.skill);
      engine.beginBeat(2);
      rejects(
        engine,
        () => consumer.run(engine, checkId),
        'RECEIPT_INVALID',
        checkId,
      );
    });
    it(`${consumer.name} rejects the wrong skill without changes`, () => {
      const engine = fixture();
      const checkId = receipt(engine, 'arcana');
      rejects(
        engine,
        () => consumer.run(engine, checkId),
        'RECEIPT_WRONG_SKILL',
        checkId,
      );
    });
    it(`${consumer.name} rejects a failed check without changes`, () => {
      const engine = fixture((seed) => {
        const actor = entry(seed.characters, 'char:player');
        actor.abilities = { str: 3, dex: 3, con: 3, int: 3, wis: 3, cha: 3 };
        actor.proficiencies = [];
      });
      const checkId = value(
        engine.skill_check({
          actor: 'char:player',
          skill: consumer.skill,
          dc: 25,
          advantage: 'none',
          reason: '',
        }),
      ).checkId;
      rejects(
        engine,
        () => consumer.run(engine, checkId),
        'RECEIPT_FAILED',
        checkId,
      );
    });
    if (consumer.name !== 'heal')
      it(`${consumer.name} rejects another actor’s receipt without changes`, () => {
        const engine = fixture();
        const checkId = receipt(engine, consumer.skill, 'char:peer');
        rejects(
          engine,
          () => consumer.run(engine, checkId),
          'RECEIPT_WRONG_ACTOR',
          'char:player',
        );
      });
  }
  it('rejects an ability receipt where a skill receipt is required', () => {
    const engine = fixture();
    const checkId = value(
      engine.skill_check({
        actor: 'char:player',
        ability: 'dex',
        dc: 5,
        advantage: 'none',
        reason: '',
      }),
    ).checkId;
    rejects(
      engine,
      () => engine.hide({ actor: 'char:player', checkId }),
      'RECEIPT_WRONG_SKILL',
      'dex',
    );
  });
  it('rejects a spent receipt without changing state', () => {
    const engine = fixture();
    const checkId = receipt(engine);
    value(engine.hide({ actor: 'char:player', checkId }));
    rejects(
      engine,
      () => engine.hide({ actor: 'char:player', checkId }),
      'RECEIPT_SPENT',
      checkId,
    );
  });
  it.each(['failure', 'tie'] as const)(
    'rejects a contested %s as authorization',
    (outcome) => {
      const engine = fixture();
      const checks = Array.from({ length: 200 }, () =>
        value(
          engine.contested_check({
            actor: 'char:player',
            skill: 'stealth',
            target: 'char:seller',
            targetSkill: 'perception',
            reason: '',
          }),
        ),
      );
      const check = checks.find(
        (candidate) => candidate.actorRoll.outcome === outcome,
      );
      if (!check) throw new Error(`Fixture did not produce ${outcome}`);
      rejects(
        engine,
        () => engine.hide({ actor: 'char:player', checkId: check.checkId }),
        'RECEIPT_FAILED',
        check.checkId,
      );
    },
  );
  it('accepts a contested actor win as authorization', () => {
    const engine = fixture();
    const checks = Array.from({ length: 20 }, () =>
      value(
        engine.contested_check({
          actor: 'char:player',
          skill: 'stealth',
          target: 'char:seller',
          targetSkill: 'perception',
          reason: '',
        }),
      ),
    );
    const check = checks.find(
      (candidate) => candidate.winner === 'char:player',
    );
    if (!check) throw new Error('Fixture did not produce a win');
    expect(
      engine.hide({ actor: 'char:player', checkId: check.checkId }).ok,
    ).toBe(true);
  });
});
