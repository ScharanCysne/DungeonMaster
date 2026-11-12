import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, test } from 'vitest';
import { logPath } from '../ontology/eventLog.js';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

test.each(['missing', 'version'])(
  'replay launcher reports %s logs without credentials or loading an environment file',
  async (kind) => {
    const directory = await mkdtemp(join(tmpdir(), 'dungeon-replay-cli-'));
    directories.push(directory);
    const path = logPath(directory, 'test');
    if (kind === 'version') {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, '{"v":99}\n');
    }
    const operation = promisify(execFile)(
      process.execPath,
      [resolve('packages/server/scripts/replay.mjs'), 'test'],
      {
        env: {
          PATH: process.env.PATH ?? '',
          DUNGEON_ENV_FILE: join(directory, 'absent-config'),
          DUNGEON_DATA_DIR: directory,
        },
        timeout: 15_000,
      },
    );
    await expect(operation).rejects.toMatchObject({
      code: 1,
      stdout: '',
      stderr:
        kind === 'version'
          ? 'Unsupported event log major version 99 at line 1; supported version: 1.\n'
          : `Cannot rebuild session test: event log not found at ${path}.\n`,
    });
  },
  20_000,
);
