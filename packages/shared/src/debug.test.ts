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
import { fact, provenance } from './testing/fixtures.js';

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
