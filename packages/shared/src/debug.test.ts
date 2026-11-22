import { expect, test } from 'vitest';
import * as d from './debug.js';
import {
  graph,
  knowledge,
  trace,
  traceCall,
  usage,
} from './testing/protocol-fixtures.js';
import { schemaCases } from './testing/schema-cases.js';
import {
  envelope,
  fact,
  knowsEdge,
  narration,
  provenance,
  supersedesEdge,
} from './testing/fixtures.js';
import { eventPayloads } from './testing/event-fixtures.js';

schemaCases([
  ['graph', d.graphSchema, graph, { nodes: [], edges: [{ type: 'LIKES' }] }],
  [
    'knowledge slice',
    d.knowledgeSliceSchema,
    knowledge,
    { ...knowledge, character: 'char:player' },
  ],
  ['token usage', d.tokenUsageSchema, usage, { ...usage, cacheRead: -1 }],
  [
    'trace call',
    d.traceCallSchema,
    traceCall,
    { ...traceCall, costUsd: '0.01' },
  ],
  ['beat trace', d.beatTraceSchema, trace, { ...trace, outcome: 'success' }],
  ['debug kind', d.debugKindSchema, 'knowledge', 'state'],
]);
test('trace payloads reject non-JSON provider data', () => {
  expect(
    d.traceCallSchema.safeParse({
      ...traceCall,
      response: { callback: () => 'text' },
    }).success,
  ).toBe(false);
});
test('knowledge slices reject confidence outside the allowed range', () => {
  expect(
    d.knowledgeSliceSchema.safeParse({
      ...knowledge,
      facts: [
        {
          fact,
          knowledge: {
            ...provenance,
            type: 'KNOWS',
            from: 'char:player',
            to: 'fact:quill',
            properties: { since: 0, source: 'seed', confidence: 1.5 },
          },
        },
      ],
    }).success,
  ).toBe(false);
});
schemaCases([
  [
    'NPC voice trace call',
    d.traceCallSchema,
    { ...traceCall, role: 'npc_voice' },
    { ...traceCall, role: 'voice_npc' },
  ],
  [
    'graph with superseding facts',
    d.graphSchema,
    { ...graph, edges: [supersedesEdge] },
    { ...graph, edges: [{ ...supersedesEdge, from: 'char:brann' }] },
  ],
  [
    'knowledge with a retraction beat',
    d.knowledgeSliceSchema,
    {
      ...knowledge,
      facts: [
        {
          fact,
          knowledge: {
            ...knowsEdge,
            properties: { ...knowsEdge.properties, retractedAtBeat: 1 },
          },
        },
      ],
    },
    {
      ...knowledge,
      facts: [
        {
          fact,
          knowledge: {
            ...knowsEdge,
            properties: { ...knowsEdge.properties, retractedAtBeat: -1 },
          },
        },
      ],
    },
  ],
]);
test('beat traces accept committed resolved narration alongside rejected references', () => {
  expect(
    d.beatTraceSchema.safeParse({
      ...trace,
      events: [
        {
          ...envelope,
          type: 'CriticRejected',
          payload: eventPayloads.CriticRejected,
        },
        {
          ...envelope,
          type: 'NarrationCommitted',
          payload: eventPayloads.NarrationCommitted,
        },
      ],
    }).success,
  ).toBe(true);
});
test('beat traces reject committed unresolved narration', () => {
  expect(
    d.beatTraceSchema.safeParse({
      ...trace,
      events: [{ ...envelope, type: 'NarrationCommitted', payload: narration }],
    }).success,
  ).toBe(false);
});
