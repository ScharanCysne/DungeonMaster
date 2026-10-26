import { expect, test } from 'vitest';
import type { z } from 'zod';

export function schemaCases(
  cases: ReadonlyArray<readonly [string, z.ZodType, unknown, unknown]>,
) {
  for (const [name, schema, valid, invalid] of cases) {
    test(`${name} accepts a valid sample`, () => {
      expect(schema.safeParse(valid).success).toBe(true);
    });
    test(`${name} rejects the malformed sample`, () => {
      expect(schema.safeParse(invalid).success).toBe(false);
    });
  }
}
