import type { ComponentProps, ReactNode } from 'react';
import { Composer } from './Composer';
import { Journal } from './Journal';

export function RightPage({
  journal,
  composer,
  appendix,
  error,
}: {
  journal: ComponentProps<typeof Journal>;
  composer: ComponentProps<typeof Composer>;
  appendix?: ReactNode;
  error: string | null;
}) {
  return (
    <section className="page right-page" aria-label="Your story">
      <div className="story-content" inert={!!appendix}>
        <Journal {...journal} />
        {error && (
          <p className="connection-error" role="alert">
            {error}
          </p>
        )}
        <Composer {...composer} />
      </div>
      {appendix}
    </section>
  );
}
