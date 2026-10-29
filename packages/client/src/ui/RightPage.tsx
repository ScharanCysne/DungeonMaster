import type { ComponentProps } from 'react';
import type { DebugKind } from '@dungeon/shared';
import { AppendixDrawer } from './Appendix';
import { Composer } from './Composer';
import { Journal } from './Journal';

export function RightPage({
  journal,
  composer,
  appendix,
  onCloseAppendix,
  error,
}: {
  journal: ComponentProps<typeof Journal>;
  composer: ComponentProps<typeof Composer>;
  appendix: DebugKind | null;
  onCloseAppendix: () => void;
  error: string | null;
}) {
  return (
    <section className="page right-page" aria-label="Your story">
      <div className="story-content" inert={appendix !== null}>
        <Journal {...journal} />
        {error && (
          <p className="connection-error" role="alert">
            {error}
          </p>
        )}
        <Composer {...composer} />
      </div>
      {appendix && <AppendixDrawer tab={appendix} onClose={onCloseAppendix} />}
    </section>
  );
}
