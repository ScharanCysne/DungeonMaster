import { criticVerdictSchema } from '@dungeon/shared';
import type { BeatTrace, CriticVerdict } from '@dungeon/shared';
import { z } from 'zod';

const toolUse = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.json(),
});
const toolResult = z.object({
  type: z.literal('tool_result'),
  tool_use_id: z.string(),
  content: z.string(),
  is_error: z.boolean().optional(),
});
const response = z.object({
  content: z.array(z.json()).optional(),
  parsedOutput: z.json().optional(),
});
const request = z.object({
  messages: z.array(
    z.object({ content: z.union([z.string(), z.array(z.json())]) }),
  ),
});
const criticOutput = z.object({ verdict: criticVerdictSchema });

function results(value: BeatTrace['calls'][number]['request']) {
  const parsed = request.safeParse(value);
  return parsed.success
    ? parsed.data.messages.flatMap((message) =>
        typeof message.content === 'string'
          ? []
          : message.content.flatMap((block) => {
              const result = toolResult.safeParse(block);
              return result.success ? [result.data] : [];
            }),
      )
    : [];
}

export function traceModel(trace: BeatTrace) {
  const tools = trace.calls.flatMap((call, index) => {
    const parsed = response.safeParse(call.response);
    return (parsed.success ? (parsed.data.content ?? []) : []).flatMap(
      (block) => {
        const use = toolUse.safeParse(block);
        if (!use.success) return [];
        // Requests contain repeated conversation history; only response blocks create rows.
        const result = trace.calls
          .slice(index + 1)
          .filter((next) => next.role === call.role)
          .map((next) =>
            results(next.request).findLast(
              (item) => item.tool_use_id === use.data.id,
            ),
          )
          .find((item) => item !== undefined);
        return [
          {
            ...use.data,
            key: `${index}:${use.data.id}`,
            // A narrate that ended the loop gets no later request carrying its
            // result; the loop only ends on an accepted narrate (rejected ones
            // are retried and their errors do appear), so it succeeded.
            ok: result
              ? !result.is_error
              : use.data.name === 'narrate'
                ? true
                : null,
            result: result?.content ?? 'Result not recorded in this trace.',
          },
        ];
      },
    );
  });
  const checks: CriticVerdict[] = trace.calls
    .filter((call) => call.role === 'critic')
    .flatMap((call) => {
      const parsed = response.safeParse(call.response);
      const check = criticOutput.safeParse(
        parsed.success ? parsed.data.parsedOutput : null,
      );
      return check.success ? [check.data.verdict] : [];
    });
  if (!checks.length && trace.critic) checks.push(trace.critic);
  const issues = [
    ...checks.flatMap((check) => (check.ok ? [] : check.issues)),
    ...trace.events.flatMap((event) =>
      event.type === 'CriticRejected' ? event.payload.issues : [],
    ),
  ].filter(
    (issue, index, all) =>
      all.findIndex(
        (other) => JSON.stringify(other) === JSON.stringify(issue),
      ) === index,
  );
  const usage = trace.calls.reduce(
    (sum, call) => ({
      input: sum.input + call.usage.input,
      output: sum.output + call.usage.output,
      cacheRead: sum.cacheRead + call.usage.cacheRead,
      cacheWrite: sum.cacheWrite + call.usage.cacheWrite,
    }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  );
  const totalInput = usage.input + usage.cacheRead + usage.cacheWrite;
  return {
    tools,
    checks,
    issues,
    usage,
    totalInput,
    cachePercent: totalInput
      ? Math.round((100 * usage.cacheRead) / totalInput)
      : 0,
    retries: Math.max(
      0,
      trace.calls.filter((call) => call.role === 'critic').length - 1,
    ),
  };
}

export function latestTraces(traces: Record<string, BeatTrace>) {
  const sorted = Object.values(traces).sort(
    (a, b) => b.beat - a.beat || b.attempt - a.attempt,
  );
  return sorted.filter(
    (trace, index) =>
      sorted.findIndex((item) => item.beat === trace.beat) === index,
  );
}
