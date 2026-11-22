import type {
  LlmMessage,
  LlmResponse,
  ToolResultBlock,
  ToolSchema,
  ToolUseBlock,
} from './types.js';

export function validateToolInput(tool: ToolSchema, call: ToolUseBlock) {
  if (tool.name !== call.name) throw new Error(`Unexpected tool: ${call.name}`);
  return tool.inputSchema.safeParse(call.input);
}

export function appendToolResults(
  messages: LlmMessage[],
  response: LlmResponse,
  results: ToolResultBlock[],
): LlmMessage[] {
  if (
    response.stopReason !== 'tool_use' &&
    response.stopReason !== 'max_tokens'
  )
    throw new Error('Tool results require a tool_use or max_tokens response');
  const ids = response.content
    .filter((block) => block.type === 'tool_use')
    .map((block) => block.id);
  if (
    !ids.length ||
    new Set(ids).size !== ids.length ||
    results.length !== ids.length ||
    new Set(results.map((result) => result.tool_use_id)).size !== ids.length ||
    results.some((result) => !ids.includes(result.tool_use_id))
  ) {
    throw new Error(
      'Supply exactly one result for every tool use in a single user turn',
    );
  }
  return [
    ...messages,
    { role: 'assistant', content: response.content },
    { role: 'user', content: results },
  ];
}
