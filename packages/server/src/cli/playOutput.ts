import type { ServerMessage } from '@dungeon/shared';
import { displayMessage } from './playDisplay.js';
import type { MentionEntity } from './playParser.js';
import type { createStatusRenderer } from './playStatus.js';

export function createPlayOutput(options: {
  status: ReturnType<typeof createStatusRenderer>;
  visibleNames: () => Promise<readonly MentionEntity[]>;
}) {
  const { status } = options;
  let pending = Promise.resolve();
  const names = new Map<string, string>();
  const remember = (entities: readonly MentionEntity[]) => {
    for (const entity of entities) names.set(entity.id, entity.name);
  };
  return {
    remember,
    flush: () => pending,
    message(message: ServerMessage) {
      pending = pending
        .then(async () => {
          status.message(message);
          if (message.type === 'beat_result') {
            try {
              remember(await options.visibleNames());
            } catch {
              // A projection outage must not hide the committed result.
            }
          }
          displayMessage(message, status.write, (id) => names.get(id));
        })
        .catch((error: unknown) => {
          status.stop();
          status.write(
            error instanceof Error ? error.message : 'Display failed.',
          );
        });
    },
  };
}
