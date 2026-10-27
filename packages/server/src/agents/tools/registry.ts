import { toolSchemas as s } from '@dungeon/shared';
import { defineTool } from './definition.js';
import { narrate, voiceNpc } from './dialogue.js';
import { createFact, setAttitude, setQuestStatus, shareFact } from './soft.js';
import type { ToolRegistry } from './types.js';

export const toolRegistry = Object.freeze([
  defineTool('move', 'engine', s.move, (i, c) =>
    Promise.resolve(c.engine.move(i)),
  ),
  defineTool('skill_check', 'engine', s.skill_check, (i, c) =>
    Promise.resolve(c.engine.skill_check(i)),
  ),
  defineTool('contested_check', 'engine', s.contested_check, (i, c) =>
    Promise.resolve(c.engine.contested_check(i)),
  ),
  defineTool('search', 'engine', s.search, (i, c) =>
    Promise.resolve(c.engine.search(i)),
  ),
  defineTool('open_container', 'engine', s.open_container, (i, c) =>
    Promise.resolve(c.engine.open_container(i)),
  ),
  defineTool('unlock_container', 'engine', s.unlock_container, (i, c) =>
    Promise.resolve(c.engine.unlock_container(i)),
  ),
  defineTool('transfer_item', 'engine', s.transfer_item, (i, c) =>
    Promise.resolve(c.engine.transfer_item(i)),
  ),
  defineTool('equip', 'engine', s.equip, (i, c) =>
    Promise.resolve(c.engine.equip(i)),
  ),
  defineTool('unequip', 'engine', s.unequip, (i, c) =>
    Promise.resolve(c.engine.unequip(i)),
  ),
  defineTool('hide', 'engine', s.hide, (i, c) =>
    Promise.resolve(c.engine.hide(i)),
  ),
  defineTool('attack', 'engine', s.attack, (i, c) =>
    Promise.resolve(c.engine.attack(i)),
  ),
  defineTool('apply_damage', 'engine', s.apply_damage, (i, c) =>
    Promise.resolve(c.engine.apply_damage(i)),
  ),
  defineTool('heal', 'engine', s.heal, (i, c) =>
    Promise.resolve(c.engine.heal(i)),
  ),
  defineTool('pass_turn', 'engine', s.pass_turn, (i, c) =>
    Promise.resolve(c.engine.pass_turn(i)),
  ),
  defineTool('end_combat', 'engine', s.end_combat, (i, c) =>
    Promise.resolve(c.engine.end_combat(i)),
  ),
  defineTool('set_attitude', 'soft', s.set_attitude, setAttitude),
  defineTool('share_fact', 'soft', s.share_fact, shareFact),
  defineTool('create_fact', 'soft', s.create_fact, createFact),
  defineTool('set_quest_status', 'soft', s.set_quest_status, setQuestStatus),
  defineTool('generate_item', 'generator', s.generate_item, (i, c) =>
    c.generators.generate_item(i, c),
  ),
  defineTool('generate_npc', 'generator', s.generate_npc, (i, c) =>
    c.generators.generate_npc(i, c),
  ),
  defineTool('generate_feature', 'generator', s.generate_feature, (i, c) =>
    c.generators.generate_feature(i, c),
  ),
  defineTool('generate_story', 'generator', s.generate_story, (i, c) =>
    c.generators.generate_story(i, c),
  ),
  defineTool('voice_npc', 'soft', s.voice_npc, voiceNpc),
  defineTool('narrate', 'terminal', s.narrate, narrate),
] satisfies ToolRegistry);
