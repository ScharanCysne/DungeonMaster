import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../../../', import.meta.url));
process.chdir(root);
const server = await createServer({
  root,
  configFile: false,
  logLevel: 'silent',
  server: { middlewareMode: true, watch: null, hmr: false },
  ssr: { noExternal: ['@dungeon/shared'] },
});
try {
  await server.ssrLoadModule('/packages/server/src/cli/graphRebuild.ts');
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message.replace(/[\r\n]+/g, ' ')
      : 'Graph rebuild failed.',
  );
  process.exitCode = 1;
} finally {
  await server.close();
}
