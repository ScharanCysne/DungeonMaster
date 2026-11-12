import type { ComponentProps, ReactNode } from 'react';
import { Composer } from './Composer';
import { Journal } from './Journal';

export function RightPage({
  journal,
  composer,
  appendix,
  error,
  timeline,
  ending,
}: {
  journal: ComponentProps<typeof Journal>;
  composer: ComponentProps<typeof Composer>;
  appendix?: ReactNode;
  error: string | null;
  timeline?: ReactNode;
  ending?: ReactNode;
}) {
  return (
    <section className="page right-page" aria-label="Your story">
      <div className="story-content" inert={!!appendix}>
        {timeline}
        {ending ?? <Journal {...journal} />}
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
