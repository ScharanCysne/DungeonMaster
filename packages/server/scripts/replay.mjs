import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { loadProjectEnv } from './loadProjectEnv.mjs';

const args = process.argv.slice(2);
if (!args[0] || args[0].startsWith('--')) {
  console.error('Usage: npm run replay -- <sessionId> [--neo4j]');
  process.exit(1);
}
process.argv.splice(2, 0, '--replay');
const root = fileURLToPath(new URL('../../../', import.meta.url));
loadProjectEnv(root);
process.chdir(root);
const server = await createServer({
  root,
  configFile: false,
  envDir: false,
  logLevel: 'silent',
  server: { middlewareMode: true, watch: null, hmr: false },
  ssr: { noExternal: ['@dungeon/shared'] },
});
try {
  await server.ssrLoadModule('/packages/server/src/server/main.ts');
} catch (error) {
  const key = process.env.ANTHROPIC_API_KEY;
  const message = error instanceof Error ? error.message : 'Server failed.';
  console.error(
    (key ? message.replaceAll(key, '[REDACTED]') : message).replace(
      /[\r\n]+/g,
      ' ',
    ),
  );
  process.exitCode = 1;
} finally {
  await server.close();
}
