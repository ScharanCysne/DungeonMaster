import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LlmRole } from './types.js';

export async function loadPrompt(
  role: LlmRole,
  promptDir: string,
): Promise<{ text: string; version: string }> {
  const source = await readFile(join(promptDir, `${role}.md`), 'utf8');
  const [header, ...lines] = source.split(/\r?\n/);
  const match = /^<!-- prompt: ([a-z_]+) (v[0-9]+) -->$/.exec(header ?? '');
  if (match?.[1] !== role || !match[2])
    throw new Error(`Missing or invalid prompt version for ${role}`);
  return { text: lines.join('\n').trim(), version: match[2] };
}
