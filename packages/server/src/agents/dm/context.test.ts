import { eventNodeSchema } from '@dungeon/shared';
import { expect, it } from 'vitest';
import { envelopeDrafts } from '../../ontology/eventLog.js';
import { project } from '../../ontology/projector.js';
import { estimateTokens, renderDynamicContext } from './budget.js';
import { loadDmContext } from './context.js';
import { renderEpisode, renderKnowledge, renderRecap } from './render.js';
import { fixture, intents, narration } from './testing.js';

it('renders real Episode N ground truth, selection, present knowledge and peer speech', async () => {
  const { ctx, seed } = await fixture();
  const data = await loadDmContext(ctx, 'char:kael', intents);
  const rendered = renderDynamicContext(data);
  expect(rendered.droppedContext.events).toEqual([]);
  expect(rendered.droppedContext.neighbours).toEqual([]);
  expect(rendered.droppedContext.overBudget).toBe(false);
  expect(rendered.text).toContain(
    'container:old-barrel -CONTAINS-> item:quill',
  );
  expect(rendered.text).toContain('"hidden":true,"findDc":15,"locked":true');
  expect(rendered.text).toContain('room loc:common-room');
  expect(rendered.text).toContain('loc:kitchen');
  expect(rendered.text).toContain('Selected: container:floorboard');
  expect(rendered.text).toContain('Brann, love, is that a new keg?');
  expect(rendered.text).toContain('Combat: none');
  expect(rendered.text).toContain('"darkvision"');
  expect(rendered.text).toContain('"ranged"');
  expect(rendered.text).toContain('"finesse"');
  expect(data.npcs.map((slice) => slice.character.id)).toContain('char:tobb');
  expect(data.npcs.map((slice) => slice.character.id)).not.toContain(
    'char:brann',
  );
  expect(renderEpisode(seed)).toContain('truth=false');
  expect(renderRecap('Earlier adventures.')).toContain(
    'atmosphere only, not ground truth',
  );
  expect(renderRecap()).toBeUndefined();
  expect(renderRecap(' ')).toBeUndefined();
});

it('uses deterministic graph order without changing input', async () => {
  const { ctx, seed } = await fixture();
  const data = await loadDmContext(ctx, 'char:kael', intents);
  const before = structuredClone(data);
  const first = renderDynamicContext(data);
  data.state.groundTruth.nodes.reverse();
  data.state.groundTruth.edges.reverse();
  data.npcs.reverse();
  expect(renderDynamicContext(data)).toEqual(first);
  expect(renderDynamicContext(before)).toEqual(first);
  expect(
    renderEpisode({
      ...seed,
      facts: [...seed.facts].reverse(),
      quests: [...seed.quests].reverse(),
    }),
  ).toEqual(renderEpisode(seed));
});

it('drops oldest event excerpts before peripheral neighbours while protecting selection and intents', async () => {
  const { ctx } = await fixture();
  const data = await loadDmContext(ctx, 'char:kael', intents);
  const makeEvent = (seq: number) =>
    eventNodeSchema.parse({
      id: `event:0-${seq}`,
      name: 'Event',
      summary: `event ${seq} ${'x'.repeat(1000)}`,
      tags: [],
      createdBy: 'engine',
      createdAtBeat: 0,
      beat: 0,
      seq,
      type: 'CheckRolled',
      private: false,
    });
  data.state.events = [makeEvent(2), makeEvent(0), makeEvent(1)];
  const npc = data.npcs[0];
  if (!npc) throw new Error('Expected a present NPC');
  npc.events = [makeEvent(0)];
  const full = renderDynamicContext(data);
  const reduced = renderDynamicContext(
    data,
    full.droppedContext.estimatedTokensBefore - 100,
  );
  expect(reduced.droppedContext.events).toEqual(['event:0-0']);
  expect(reduced.droppedContext.neighbours).toEqual([]);
  expect(reduced.text).not.toContain('event 0 xxx');
  expect(reduced.text).toContain('event 1 xxx');
  const smallest = renderDynamicContext(data, 1);
  expect(smallest.droppedContext.events).toEqual([
    'event:0-0',
    'event:0-1',
    'event:0-2',
  ]);
  expect(smallest.droppedContext.neighbours.length).toBeGreaterThan(0);
  expect(smallest.droppedContext.overBudget).toBe(true);
  expect(smallest.text).toContain(JSON.stringify(intents.player));
  expect(smallest.text).toContain('Selected: char:brann');
  expect(smallest.text).toContain('fact:brann-rigged');
  expect(smallest.text).toContain('Brann, love, is that a new keg?');
  expect(smallest.text).toContain(
    'container:old-barrel -CONTAINS-> item:quill',
  );
  expect(data.state.events).toHaveLength(3);
  expect(smallest.droppedContext.estimatedTokensAfter).toBe(
    Math.ceil(smallest.text.length / 4),
  );
  expect(estimateTokens('12345')).toBe(2);
});

it('keeps the last three narrations even outside the recent event window or below budget', async () => {
  const { ctx, store } = await fixture();
  for (const beat of [1, 2, 3, 4])
    await store.apply(
      envelopeDrafts(
        [
          {
            type: 'NarrationCommitted',
            payload: { ...narration, text: `You remember beat ${beat}.` },
            actor: null,
            private: false,
            witnesses: ['char:kael'],
          },
        ],
        { sessionId: 'test', beat, createdBy: 'engine', traceId: 'test' },
      ).flatMap(project),
    );
  const data = await loadDmContext(ctx, 'char:kael', intents, 0);
  const { text } = renderDynamicContext(data, 1);
  expect(data.state.events).toEqual([]);
  expect(text).not.toContain('You remember beat 1.');
  for (const beat of [2, 3, 4])
    expect(text).toContain(`You remember beat ${beat}.`);
});

it('renders active combat and distinguishes retracted beliefs', async () => {
  const { ctx } = await fixture();
  const data = await loadDmContext(ctx, 'char:kael', intents);
  data.combat = {
    order: ['char:kael', 'char:ilsa'],
    turn: 1,
    round: 2,
    roomId: 'loc:common-room',
    moved: true,
  };
  expect(renderDynamicContext(data).text).toContain(
    '"activeActor":"char:ilsa"',
  );
  const npc = data.npcs.find((slice) => slice.facts.length);
  const belief = npc?.facts[0];
  if (!npc || !belief) throw new Error('Expected a seeded NPC belief');
  belief.knowledge.properties.retractedAtBeat = 1;
  expect(renderKnowledge(npc)).toContain(`Used to believe: ${belief.fact.id}`);
});

it('matches the reviewed seed excerpt, including hidden state and true quill placement', async () => {
  const { ctx } = await fixture();
  const data = await loadDmContext(ctx, 'char:kael', intents);
  const { text } = renderDynamicContext(data);
  const excerpt = text
    .split('\n')
    .filter(
      (line) =>
        line.startsWith('Current state') ||
        line.startsWith('container:floorboard ') ||
        line.startsWith('container:old-barrel ') ||
        line.startsWith('item:quill ') ||
        line.startsWith('quest:quill ') ||
        line.startsWith('Combat:') ||
        line.startsWith('Player char:') ||
        line.startsWith('Peer char:'),
    )
    .join('\n');
  expect(excerpt).toMatchSnapshot();
});
