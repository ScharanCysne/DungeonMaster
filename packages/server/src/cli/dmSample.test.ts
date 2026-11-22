import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

it('dm:sample fails clearly without a key and without loading an env file', async () => {
  const result = promisify(execFile)(
    process.execPath,
    [resolve('packages/server/scripts/dm-sample.mjs')],
    {
      cwd: resolve('.'),
      env: {
        PATH: process.env.PATH ?? '',
        DUNGEON_ENV_FILE: resolve('packages/server/scripts/.no-such-env'),
      },
      timeout: 15_000,
    },
  );
  await expect(result).rejects.toMatchObject({
    code: 1,
    stdout: '',
    stderr: 'LLM dm (claude-opus-5-5): ANTHROPIC_API_KEY is missing\n',
  });
}, 20_000);
