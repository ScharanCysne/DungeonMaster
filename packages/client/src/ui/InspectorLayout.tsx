import type { ComponentProps, ReactNode } from 'react';
import { CompanionsPanel, SatchelPanel } from './Possessions';
import { RightPage } from './RightPage';
import { MapFrame } from './LeftPage';

export function InspectorLayout({
  possessions,
  story,
  map,
  knowledge,
  graph,
  trace,
}: {
  possessions: ComponentProps<typeof CompanionsPanel>;
  story: ComponentProps<typeof RightPage>;
  map: ReactNode;
  knowledge: ReactNode;
  graph: ReactNode;
  trace: ReactNode;
}) {
  return (
    <div className="inspector-layout" aria-label="Inspector layout">
      <aside className="inspector-party" aria-label="Party and knowledge">
        <CompanionsPanel {...possessions} />
        <SatchelPanel {...possessions} />
        {knowledge}
      </aside>
      <div className="inspector-centre">
        <MapFrame mapId={possessions.world.mapId}>{map}</MapFrame>
        <RightPage {...story} />
      </div>
      <aside className="inspector-debug" aria-label="Graph and trace">
        <section>
          <h2 className="section-label">Ontology · one hop</h2>
          {graph}
        </section>
        <section>
          <h2 className="section-label">Beat trace</h2>
          {trace}
        </section>
      </aside>
    </div>
  );
}
