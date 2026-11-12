import {
  beatTraceSchema,
  graphSchema,
  knowledgeSliceSchema,
} from '@dungeon/shared';
import {
  character,
  container,
  fact,
  item,
  knowsEdge,
  location,
  provenance,
  quest,
} from '../../../shared/src/testing/fixtures';
import {
  trace,
  traceCall,
} from '../../../shared/src/testing/protocol-fixtures';

export const debugGraph = graphSchema.parse({
  nodes: [
    character,
    container,
    item,
    fact,
    location,
    quest,
    {
      ...character,
      id: 'char:hidden',
      name: 'Hidden stranger',
      role: 'npc',
      hidden: true,
    },
  ],
  edges: [
    knowsEdge,
    {
      ...provenance,
      type: 'CONTAINS',
      from: container.id,
      to: item.id,
      properties: {},
    },
    {
      ...provenance,
      type: 'LOCATED_IN',
      from: 'char:hidden',
      to: location.id,
      properties: {},
    },
  ],
});
export const debugKnowledge = knowledgeSliceSchema.parse({
  character,
  facts: [{ fact, knowledge: knowsEdge }],
  events: [],
  visible: [],
  attitudes: [
    {
      ...provenance,
      type: 'ATTITUDE',
      from: character.id,
      to: 'char:brann',
      properties: { value: -10, reason: 'Untrustworthy' },
    },
  ],
  quests: [quest],
  secrets: [],
  inventory: [],
});
export const issue = {
  type: 'npc_knowledge_leak',
  quote: 'The hidden quill',
  explanation: 'Brann has not learned this fact.',
};
const toolResponse = {
  content: [
    {
      type: 'tool_use',
      id: 'good',
      name: 'inspect',
      input: { target: 'container:box' },
    },
    {
      type: 'tool_use',
      id: 'bad',
      name: 'transfer_item',
      input: { item: 'item:quill' },
    },
  ],
};
export const debugTrace = beatTraceSchema.parse({
  ...trace,
  outcome: 'fallback',
  intents: [
    {
      actor: 'char:player',
      selection: [],
      text: 'Look inside.',
      private: false,
    },
  ],
  calls: [
    { ...traceCall, response: toolResponse },
    {
      ...traceCall,
      request: {
        messages: [
          { role: 'assistant', content: toolResponse.content },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'good',
                content: '{"ok":true,"contents":[]}',
              },
              {
                type: 'tool_result',
                tool_use_id: 'bad',
                is_error: true,
                content:
                  '{"ok":false,"error":{"message":"Container is locked"}}',
              },
            ],
          },
        ],
      },
      response: { content: [] },
    },
    {
      ...traceCall,
      role: 'critic',
      response: { parsedOutput: { verdict: { ok: false, issues: [issue] } } },
    },
    {
      ...traceCall,
      role: 'critic',
      response: { parsedOutput: { verdict: { ok: true } } },
    },
  ],
});
