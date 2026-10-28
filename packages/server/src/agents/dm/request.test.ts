import { expect, it } from 'vitest';
import { prepareRequest } from '../llm/request.js';
import { providerFor, wireMessage } from '../llm/testing.js';
import { toolRegistry } from '../tools/registry.js';
import { renderEpisode } from './render.js';
import { assembleDmRequest, loadDmPrompts } from './request.js';
import { finish, fixture } from './testing.js';

it('orders 1h prefixes before recap and automatic 5m tail caching with auto tool choice', async () => {
  const { dm, provider } = await fixture([finish]);
  await dm.run();
  const request = provider.requests[0];
  if (!request) throw new Error('Missing request');
  expect(request.role).toBe('dm');
  expect(request.cacheTail).toBe('5m');
  expect(request.system).toHaveLength(3);
  expect(request.system[0]).toMatchObject({
    cache: true,
    ttl: '1h',
  });
  expect(request.system[0]?.text).toContain('dungeon master');
  expect(request.system[0]?.text).toContain('Dungeon uses 5e-lite.');
  expect(request.system[1]).toMatchObject({
    cache: true,
    ttl: '1h',
  });
  expect(request.system[1]?.text).toContain('Episode episode-n');
  expect(request.system[2]).toEqual({
    text: 'Story so far (atmosphere only, not ground truth):\nRain has kept you at the tavern.',
    cache: false,
  });
  expect(request.tools?.filter((tool) => tool.cache)).toEqual([
    request.tools?.at(-1),
  ]);
  expect(request.tools?.at(-1)).toMatchObject({
    name: 'narrate',
    cache: true,
    ttl: '1h',
  });
  expect(request.tools?.filter((tool) => tool.strict)).toHaveLength(14);
  expect(request).not.toHaveProperty('tool_choice');
  expect(request.messages).toHaveLength(1);
  expect(request.promptVersion).toBe('dm-principles:v4,dm-rules:v3');
  const prepared = prepareRequest(request);
  expect(prepared.tool_choice).toEqual({ type: 'auto' });
  expect(prepared.tools?.at(-1)?.cache_control).toEqual({
    type: 'ephemeral',
    ttl: '1h',
  });
  expect(prepared.system.map((block) => block.cache_control)).toEqual([
    { type: 'ephemeral', ttl: '1h' },
    { type: 'ephemeral', ttl: '1h' },
    undefined,
  ]);
  const transport = providerFor(wireMessage());
  await transport.provider.complete(request);
  expect(transport.bodies[0]).toMatchObject({
    model: 'claude-opus-5-5',
    output_config: { effort: 'medium' },
    tool_choice: { type: 'auto' },
    fallbacks: 'default',
    cache_control: { type: 'ephemeral', ttl: '5m' },
  });
});

it('omits absent recap and keeps the episode prefix stable across changing intents', async () => {
  const { seed } = await fixture();
  const prompts = await loadDmPrompts();
  const options = { seed, prompts, registry: toolRegistry, timeoutMs: 1000 };
  const first = assembleDmRequest({ ...options, dynamic: 'First intent.' });
  const second = assembleDmRequest({
    ...options,
    dynamic: 'Second intent.',
    recap: ' ',
  });
  expect(first.system).toHaveLength(2);
  expect(second.system).toEqual(first.system);
  expect(first.system[1]?.text).toBe(renderEpisode(seed));
  expect(second.messages).not.toEqual(first.messages);
  expect(prepareRequest(second)).toEqual(prepareRequest(first));
});
