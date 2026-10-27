import { slugify, uniqueId } from '@dungeon/shared';

function fitSlug(slug: string, budget: number) {
  if (slug.length <= budget) return slug;
  const prefix = slug.slice(0, budget + 1);
  const boundary = prefix.lastIndexOf('-');
  return prefix.slice(0, boundary > 0 ? boundary : budget);
}

// The display name keeps the statement's own wording and capitalisation.
function factName(statement: string, limit = 43) {
  const words = statement.trim().split(/\s+/u);
  while (words.length > 1 && /^(a|an|the)$/iu.test(words[0] ?? ''))
    words.shift();
  let name = '';
  for (const word of words.slice(0, 8)) {
    const next = name ? `${name} ${word}` : word;
    if (next.length > limit) break;
    name = next;
  }
  const trimmed = (name || statement.slice(0, limit))
    .replace(/[\s.,;:!?'"’-]+$/u, '')
    .trim();
  return trimmed || 'unnamed';
}

export function factIdentity(statement: string, ids: ReadonlySet<string>) {
  const words = slugify(statement).split('-');
  while (words.length > 1 && /^(a|an|the)$/.test(words[0] ?? '')) words.shift();
  const short = words.slice(0, 6).join('-');
  let budget = 43;
  let slug = fitSlug(short, budget);
  const name = factName(statement);
  let id = uniqueId('fact', slug, ids);
  // Reserve the actual collision suffix inside the 48-character ID limit.
  while (id.length > 48) {
    budget -= id.length - 48;
    slug = fitSlug(short, budget);
    id = uniqueId('fact', slug, ids);
  }
  return { id, name };
}
