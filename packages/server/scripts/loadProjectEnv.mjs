import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// The project's .env must win over variables inherited from the shell: an
// ambient ANTHROPIC_API_KEY/ANTHROPIC_BASE_URL pair (e.g. a company gateway)
// would otherwise silently replace the project's own credentials, and
// `node --env-file` never overrides variables that are already set.
// DUNGEON_ENV_FILE points at another file, or at nothing (tests use this so a
// launcher can never pick up real credentials).
/** @param {string} root repository root, ending with a slash */
export function loadProjectEnv(root) {
  const path = process.env.DUNGEON_ENV_FILE ?? `${root}.env`;
  const values = existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {};
  for (const [name, value] of Object.entries(values)) process.env[name] = value;
  if (!('ANTHROPIC_BASE_URL' in values)) delete process.env.ANTHROPIC_BASE_URL;
}
