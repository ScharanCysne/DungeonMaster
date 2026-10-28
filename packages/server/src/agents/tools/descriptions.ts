import type { ToolName } from './types.js';

export const descriptions: Record<ToolName, string> = {
  move: 'Move a conscious actor to a location or next to an entity in the tavern. Locked paths and combat turn/move limits still apply; do not use to teleport items. Returns the actual destination, tile and path.',
  skill_check:
    "Roll when an outcome is uncertain. For each check, give exactly one of skill or ability; leave the other null. Choose DC 5/10/15/20/25, supply advantage and state the DC with its justification in reason before rolling. Do not claim the outcome before rolling. Returns total, outcome and checkId; dependent actions must spend this beat's successful receipt for the same actor.",
  contested_check:
    "Resolve opposed skills between present, conscious characters. Do not substitute a fixed success or use for an attack. Returns both rolls, winner (null on a tie) and the initiating actor's checkId; only a successful receipt can back an action.",
  search:
    "Search the actor's current area after a successful Perception or Investigation check this beat. Supply its checkId; do not reveal inaccessible or undiscovered contents by narration. Returns the IDs actually revealed.",
  open_container:
    "Open a visible, unlocked container in the actor's room. Do not use to bypass a lock or take its contents. Returns the container and newly revealed item IDs.",
  unlock_container:
    'Unlock a present visible container. Key requires itemId of a matching carried key; lockpick or force requires a successful checkId meeting the lock DC. Do not invent receipts or assume unlocking opens it. Returns the unlocked container and revealed contents.',
  transfer_item:
    'Move a reachable item through an actor action: pick_up, give, drop, steal, buy or loot. Steal requires checkId; buy requires a nonnegative integer price and a willing seller; loot requires an unconscious holder. Do not teleport or destroy quest items. Returns actual holders and resulting gold balances.',
  equip:
    'Equip a carried item in an empty slot. Do not use to acquire items or replace occupied equipment. Returns the equipped character, item and slot.',
  unequip:
    'Remove a carried item from its equipped slot. Do not use to drop or transfer it. Returns the character, item and cleared slot.',
  hide: 'Hide a conscious actor using their successful Stealth checkId from this beat. Do not declare concealment without spending a receipt. Returns the hidden entity ID.',
  attack:
    'Attack a present target with a carried weapon or the default weapon/unarmed strike. Starts initiative if needed; combat turn rules apply. Do not use environmental damage for attacks. Returns the attack roll and hit/critical outcome; damage appears in events. A first attack can start combat yet return NOT_YOUR_TURN.',
  apply_damage:
    "Apply environmental harm such as falls, fire or poison with dice and cause. Never use this as an attack or to bypass an attack roll. Returns rolled damage and the target's resulting HP and consciousness.",
  heal: 'Heal using a present carried consumable, rest, or a successful Medicine/Religion checkId by a present healer this beat. Do not invent a healing source. Returns actual HP regained, resulting HP/consciousness and the source; consumables are spent.',
  pass_turn:
    "End the current combatant's turn without an action. Do not use outside combat or on another actor's turn. Returns the next combatant, round and turn.",
  end_combat:
    'End active combat after flight, surrender, defeat or talking down. Do not use to invent an attack outcome or change HP. Returns the recorded ending reason.',
  set_attitude:
    "Change one existing character's attitude toward another for a stated reason. Delta must be an integer within -30..30 and the configured limit. Do not change hard state or dictate speech. Returns the resulting attitude clamped to -100..100.",
  share_fact:
    "Share an existing fact with recipients in the teller's room; an explicit from must currently KNOW it. With from null, recipients must be in the player's room. Use told, deduced, read or witnessed as source. Do not invent facts or share retracted knowledge. Returns one learning record per distinct recipient.",
  create_fact:
    'Create a rumour, observation or small piece of lore, naming existing about entities and knownBy characters. Never create secret/backstory facts here, and never invent facts ABOUT a questCritical item. Optional supersedes must name an existing fact. Returns the new factId; the critic still checks truth and consistency.',
  set_quest_status:
    'Update an existing personal quest to reflect events. Never change the episode quest; the engine closes it. Returns the quest ID and status, witnessed by its pursuer.',
  generate_item:
    'Request a new item from a brief and an existing placement, optionally constraining kind and maxRarity. Do not invent it in narration or request questCritical items; generated items are capped at rare and 500 gp by default. Returns the registered item and backstory facts, or an error. Shares the three-generation beat budget.',
  generate_npc:
    'Request a new NPC at a location with optional social-role and attitude hints. Do not use to move existing characters or write dialogue. Returns the registered NPC, secret, attitudes and starting items, or an error. Shares the three-generation beat budget; episode NPC limits also apply.',
  generate_feature:
    'Request an empty container/feature at a location, optionally hidden or locked. Do not use to create its contents or move existing features. Returns the registered unopened feature, or an error. Shares the three-generation beat budget.',
  generate_story:
    'Request one to three lore, backstory or rumour facts about existing entities from a brief. Do not use to change hard state or bypass lore consistency checks. Returns registered facts, or an error. Shares the three-generation beat budget.',
  voice_npc:
    "Ask a present, conscious NPC to speak; direction is intent, at most 40 words, not authored dialogue. Never supply the NPC's words yourself or use this for peers. Returns lineId and text from that NPC's knowledge-isolated voice; cite lineId in narrate this beat. At most four attempts per beat, outside the ordinary tool cap. This does not end the loop.",
  narrate:
    "Finish the beat with at most 180 words of second-person text and dialogue lines. NPC lines must be {lineId} returned by voice_npc THIS beat; peer lines must be {speaker,text} exactly matching that peer's say. Never invent dialogue or unbacked outcomes. Optional mood is calm, tense, comic or ominous. Returns the submitted narration when recorded for the critic; errors can be corrected. Excluded from the tool cap.",
};
