import { loadNeo4jConfig } from '../config/neo4j.js';
import { loadEpisode } from '../content/index.js';
import { seedGraph } from '../content/seedGraph.js';
import { Neo4jStore } from '../ontology/Neo4jStore.js';
import { OntologyStoreError } from '../ontology/neo4jErrors.js';

async function main(): Promise<void> {
  if (process.argv.length > 2) throw new Error('Usage: npm run graph:seed');
  const content = await loadEpisode();
  if (content.problems.length) throw new Error(content.problems.join('\n'));
  const config = loadNeo4jConfig();
  try {
    const store = await Neo4jStore.connect(config);
    try {
      const counts = await seedGraph(content.seed, store);
      console.log(
        `Seeded Episode N: nodes=${counts.nodes} edges=${counts.edges}`,
      );
    } finally {
      await store.close();
    }
  } catch (error) {
    if (error instanceof OntologyStoreError)
      throw new Error(
        `Neo4j seeding failed (${error.kind}). Check the local Neo4j service and .env configuration.`,
        { cause: error },
      );
    throw error;
  }
}
await main();
