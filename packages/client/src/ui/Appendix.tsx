import type { DebugKind } from '@dungeon/shared';

const tabs: { kind: DebugKind; label: string }[] = [
  { kind: 'graph', label: 'Graph' },
  { kind: 'trace', label: 'Trace' },
  { kind: 'knowledge', label: 'Knowledge' },
];
export function AppendixTabs({
  active,
  onToggle,
}: {
  active: DebugKind | null;
  onToggle: (tab: DebugKind) => void;
}) {
  return (
    <nav className="appendix-tabs" aria-label="Appendix">
      {tabs.map(({ kind, label }) => (
        <button
          type="button"
          key={kind}
          aria-pressed={active === kind}
          aria-expanded={active === kind}
          aria-controls={active === kind ? 'appendix-drawer' : undefined}
          onClick={() => onToggle(kind)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
export function AppendixDrawer({
  tab,
  onClose,
}: {
  tab: DebugKind;
  onClose: () => void;
}) {
  return (
    <section
      className="appendix-drawer"
      id="appendix-drawer"
      aria-labelledby="appendix-title"
    >
      <header>
        <h2 id="appendix-title">Appendix · {tab}</h2>
        <button type="button" onClick={onClose}>
          close ×
        </button>
      </header>
      <div className="appendix-placeholder">
        <span aria-hidden="true">❧</span>
        <p>This page is yet to be written.</p>
      </div>
    </section>
  );
}
