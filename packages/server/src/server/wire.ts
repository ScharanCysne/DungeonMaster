import { clientMessageSchema, serverMessageSchema } from '@dungeon/shared';
import type { ClientMessage, ServerMessage } from '@dungeon/shared';
import type { ServerSocket } from './socket.js';

export class RequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class OutboundMessageError extends Error {}

export function parseClientMessage(text: string): ClientMessage {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new RequestError('BAD_MESSAGE', 'Expected valid JSON.');
  }
  const parsed = clientMessageSchema.safeParse(value);
  if (!parsed.success) {
    const fields = [
      ...new Set(
        parsed.error.issues.map((issue) => {
          const field = issue.path[0];
          return typeof field === 'string' &&
            [
              'type',
              'episodeId',
              'lastSeenBeat',
              'selection',
              'text',
              'kind',
              'target',
              'command',
            ].includes(field)
            ? field
            : 'message';
        }),
      ),
    ];
    throw new RequestError(
      'BAD_MESSAGE',
      `Invalid ${fields.join(', ')}: expected the client protocol schema (no extra fields).`,
    );
  }
  return parsed.data;
}

export function serializeServerMessage(message: unknown): string {
  const parsed = serverMessageSchema.safeParse(message);
  if (!parsed.success)
    throw new OutboundMessageError('Invalid server message.', {
      cause: parsed.error,
    });
  return JSON.stringify(parsed.data);
}

export function send(socket: ServerSocket, message: ServerMessage): void {
  const encoded = serializeServerMessage(message);
  if (socket.readyState === socket.OPEN) socket.send(encoded);
}
