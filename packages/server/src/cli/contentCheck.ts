import { loadEpisode } from '../content/index.js';

if (process.argv.length > 2) throw new Error('Usage: npm run content:check');
const content = await loadEpisode();
console.log(
  `Episode N: ${Object.entries(content.counts)
    .map(([kind, count]) => `${kind}=${count}`)
    .join(' ')}`,
);
for (const problem of content.problems) console.error(problem);
if (content.problems.length) process.exitCode = 1;
else console.log('Content checks passed.');
