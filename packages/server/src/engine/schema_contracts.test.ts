import { describe, expect, it } from 'vitest';
import { eventPayloadSchemas, toolSchemas } from '@dungeon/shared';
import { fixture, receipt, value } from './testing/fixtures.js';

describe('shared schema contracts', () => {
  it('returns drafts without persistence envelope fields and with shared payloads', () => {
    const engine = fixture();
    value(engine.move({ actor: 'char:player', to: 'container:box' }));
    value(
      engine.open_container({
        actor: 'char:player',
        container: 'container:box',
      }),
    );
    const events = engine.collectEvents();
    expect(
      events.map((event) => ({
        keys: Object.keys(event).sort(),
        valid: eventPayloadSchemas[event.type].safeParse(event.payload).success,
      })),
    ).toEqual(
      events.map(() => ({
        keys: ['actor', 'payload', 'private', 'type', 'witnesses'],
        valid: true,
      })),
    );
  });
  it('returns values compatible with every implemented shared tool output schema', () => {
    const engine = fixture();
    const outputs = [
      toolSchemas.move.output.safeParse(
        value(engine.move({ actor: 'char:player', to: 'container:box' })),
      ),
      toolSchemas.skill_check.output.safeParse(
        value(
          engine.skill_check({
            actor: 'char:player',
            ability: 'str',
            dc: 5,
            advantage: 'none',
            reason: '',
          }),
        ),
      ),
      toolSchemas.contested_check.output.safeParse(
        value(
          engine.contested_check({
            actor: 'char:player',
            skill: 'stealth',
            target: 'char:seller',
            targetSkill: 'perception',
            reason: '',
          }),
        ),
      ),
      toolSchemas.search.output.safeParse(
        value(
          engine.search({
            actor: 'char:player',
            area: 'loc:room',
            checkId: receipt(engine, 'perception'),
          }),
        ),
      ),
      toolSchemas.open_container.output.safeParse(
        value(
          engine.open_container({
            actor: 'char:player',
            container: 'container:box',
          }),
        ),
      ),
      toolSchemas.unlock_container.output.safeParse(
        value(
          engine.unlock_container({
            actor: 'char:player',
            container: 'container:lockbox',
            method: 'key',
            itemId: 'item:key',
          }),
        ),
      ),
      toolSchemas.transfer_item.output.safeParse(
        value(
          engine.transfer_item({
            actor: 'char:player',
            item: 'item:quest',
            to: 'char:player',
            reason: 'pick_up',
          }),
        ),
      ),
      toolSchemas.equip.output.safeParse(
        value(
          engine.equip({
            actor: 'char:player',
            item: 'item:rock',
            slot: 'main_hand',
          }),
        ),
      ),
      toolSchemas.unequip.output.safeParse(
        value(
          engine.unequip({
            actor: 'char:player',
            item: 'item:rock',
            slot: 'main_hand',
          }),
        ),
      ),
      toolSchemas.hide.output.safeParse(
        value(engine.hide({ actor: 'char:player', checkId: receipt(engine) })),
      ),
      toolSchemas.apply_damage.output.safeParse(
        value(
          engine.apply_damage({
            target: 'char:player',
            dice: '1d4',
            cause: 'fall',
          }),
        ),
      ),
      toolSchemas.heal.output.safeParse(
        value(
          engine.heal({ target: 'char:player', dice: '1d4', source: 'rest' }),
        ),
      ),
    ];
    expect(outputs.every((output) => output.success)).toBe(true);
  });
});
