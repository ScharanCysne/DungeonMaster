import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
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
  children,
}: {
  tab: DebugKind;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const previous = document.activeElement;
    panel.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <section
      ref={panel}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          event.preventDefault();
          onClose();
        }
      }}
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
      <div className="appendix-content">{children}</div>
    </section>
  );
}
