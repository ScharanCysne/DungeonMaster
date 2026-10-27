import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { loadPrompt } from './prompts.js';

it('loads role prompt text and a version from the first line', async () => {
  const result = await loadPrompt(
    'dm',
    resolve('packages/server/src/agents/prompts'),
  );
  expect(result.version).toBe('v1');
  expect(result.text).toContain('dungeon master');
  expect(result.text).not.toContain('<!--');
});
it.each([
  'no header',
  '<!-- prompt: peer v1 -->',
  '<!-- prompt: dm invalid -->',
])('rejects malformed or mismatched prompt headers: %s', async (header) => {
  const directory = await mkdtemp(join(tmpdir(), 'dungeon-prompt-'));
  try {
    await writeFile(join(directory, 'dm.md'), `${header}\nPrompt`);
    await expect(loadPrompt('dm', directory)).rejects.toThrow(
      'Missing or invalid prompt version for dm',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
