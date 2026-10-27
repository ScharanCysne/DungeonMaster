import { configSchema } from '@dungeon/shared';
import { AnthropicProvider } from '../agents/llm/index.js';
import { toolRegistry, toolSchemasForProvider } from '../agents/tools/index.js';

let apiError: string | undefined;
const provider = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  config: configSchema.parse({ timeouts: { providerRetries: 0 } }),
  fetch: async (input, init) => {
    const response = await fetch(input, init);
    // Preserve schema rejection details that the normal provider intentionally hides.
    if (!response.ok)
      apiError = `HTTP ${response.status}: ${await response.clone().text()}`;
    return response;
  },
});

try {
  await provider.complete({
    role: 'dm',
    system: [],
    tools: toolSchemasForProvider(toolRegistry),
    messages: [{ role: 'user', content: 'Reply with OK; do not call tools.' }],
    maxTokens: 64,
  });
  console.log('OK');
} catch (error) {
  if (apiError) throw new Error(apiError, { cause: error });
  throw error;
}
