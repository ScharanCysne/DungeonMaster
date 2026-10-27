The provider makes one model call per `complete` invocation. Tool execution and beat
limits belong to the caller. Only `AnthropicProvider.ts` imports SDK types or code.

- Pass the same shared `Config` to `AnthropicProvider` and `TracingProvider` when
  overriding defaults. Requests can override the role timeout and each cache TTL.
- DM tools take a Zod object schema in `inputSchema`. Strict tool schemas must
  forbid extra properties and require every property, including nested objects.
  Use `validateToolInput` before executing a tool; invalid inputs should produce an
  `is_error` result. `appendToolResults` preserves the complete assistant turn and
  appends all results in one user turn. It does not execute or retry tools.
- Other roles can pass `outputFormat`; `parsedOutput` then has the schema's output
  type. Missing, invalid, or incomplete output throws `LlmValidationError`.
- DM and story enable server refusal fallbacks, including story's beta structured
  parser. Final refusals throw `LlmRefusalError`; transport exhaustion throws
  `LlmUnavailableError`. Authentication and invalid requests throw `LlmRequestError`.
- `loadPrompt(role, directory)` reads a first-line `<!-- prompt: dm v1 -->` header.
  Pass its version as `promptVersion`, plus an optional `knowledgeSliceHash`.
- Wrap a provider with `TracingProvider(provider, sinks, options)`. Use
  `MemoryTraceSink` and `JsonlTraceSink(dataDir, sessionId, beat)` together. JSONL
  records append to `sessions/<id>/traces/beat-<n>.jsonl`, including repeated beat
  attempts. Typed refusal/validation errors retain response usage for cost tracking.
  The wrapper redacts the process API key; when injecting credentials directly,
  also supply them through `options.secrets`. SDK logging is disabled.
- Cache breakpoints follow tools, then system blocks. DM defaults to 1h; other
  roles default to 5m. The wrapper flags DM misses and prompts below 512 total input
  tokens. A larger total does not prove the stable prefix reaches 512 tokens;
  callers should build sufficiently long stable prefixes when caching matters.
- Prices are USD per million tokens. Cache writes are split by TTL. Haiku's
  threshold includes uncached, cache-write, and cache-read input tokens. Fallback
  iteration usage is priced per serving model without billing the aggregate twice.
  Missing prices fail explicitly. Rates use the supplied reference; no online
  pricing check was performed.

The installed SDK's Zod helper supports Zod v4, and beta `messages.parse` accepts
fallbacks and `output_config.format`. Its parser throws on malformed output rather
than always returning null, and parses before exposing `stop_reason`. The adapter
defers parser failures to preserve refusal classification. Fallback boundary blocks
must be replayed in place alongside thinking blocks.

`npm run llm:ping` uses Node's explicit env-file flag and sends four tiny requests:
DM, story, peer, and a structured peer request. The Vite launcher itself disables
automatic env-file loading. To check only the missing-key startup path, launch
`node packages/server/scripts/llm-ping.mjs` with `ANTHROPIC_API_KEY` absent.
