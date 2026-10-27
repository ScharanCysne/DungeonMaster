import { z } from 'zod';
import type { BeatContext } from './BeatContext.js';
import { descriptions } from './descriptions.js';
import { normalizeOptionalNulls, sourceSchema } from './jsonSchema.js';
import { failure } from './types.js';
import type { ToolDefinition, ToolKind, ToolName } from './types.js';

export function defineTool<I extends z.ZodType, O extends z.ZodType>(
  name: ToolName,
  kind: ToolKind,
  schemas: { input: I; output: O },
  handler: ToolDefinition<I, O>['handler'],
) {
  const definition: ToolDefinition<I, O> = {
    name,
    kind,
    ...schemas,
    handler,
    description: `${descriptions[name]} Use null for omitted optional fields. Entity IDs use their typed prefix and lowercase hyphenated slug; event IDs use event:<nonnegative beat>-<nonnegative sequence> without leading zeroes.`,
  };
  const schema = sourceSchema(schemas.input);
  return {
    ...definition,
    async execute(rawInput: unknown, ctx: BeatContext) {
      const parsed = schemas.input.safeParse(
        normalizeOptionalNulls(rawInput, schema),
      );
      if (!parsed.success)
        return failure('INVALID_INPUT', z.prettifyError(parsed.error));
      return handler(parsed.data, ctx);
    },
  };
}
