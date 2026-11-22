import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'neo4j-integration',
    environment: 'node',
    include: ['packages/server/src/**/*.integration.test.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
