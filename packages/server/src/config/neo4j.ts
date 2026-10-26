import { inspect } from 'node:util';
import { auth } from 'neo4j-driver';
import { z } from 'zod';

const neo4jEnvSchema = z.object({
  NEO4J_URI: z
    .string()
    .url()
    .refine((value) => {
      if (!URL.canParse(value)) return false;
      const uri = new URL(value);
      return (
        [
          'bolt:',
          'bolt+s:',
          'bolt+ssc:',
          'neo4j:',
          'neo4j+s:',
          'neo4j+ssc:',
        ].includes(uri.protocol) &&
        uri.hostname.length > 0 &&
        (uri.pathname === '' || uri.pathname === '/') &&
        !uri.username &&
        !uri.password &&
        !uri.search &&
        !uri.hash
      );
    }),
  NEO4J_USER: z.string().trim().min(1),
  NEO4J_PASSWORD: z.string().min(1),
});

export class Neo4jConfigError extends Error {
  constructor(variables: string[]) {
    super(
      `Missing or invalid Neo4j configuration: ${variables.join(', ')}. Check .env.`,
    );
    this.name = 'Neo4jConfigError';
  }
}

export class Neo4jConfig {
  #password: string;
  constructor(
    readonly uri: string,
    readonly user: string,
    password: string,
  ) {
    this.#password = password;
  }
  authToken() {
    return auth.basic(this.user, this.#password);
  }
  toJSON() {
    return { uri: this.uri, user: this.user, password: '[REDACTED]' };
  }
  toString(): string {
    return JSON.stringify(this.toJSON());
  }
  [inspect.custom](): string {
    return this.toString();
  }
}

export function loadNeo4jConfig(
  env: NodeJS.ProcessEnv = process.env,
): Neo4jConfig {
  const parsed = neo4jEnvSchema.safeParse(env);
  if (!parsed.success)
    throw new Neo4jConfigError([
      ...new Set(parsed.error.issues.map((issue) => String(issue.path[0]))),
    ]);
  return new Neo4jConfig(
    parsed.data.NEO4J_URI,
    parsed.data.NEO4J_USER,
    parsed.data.NEO4J_PASSWORD,
  );
}
