import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { beatTraceSchema } from '@dungeon/shared';
import { trace } from '../../../shared/src/testing/protocol-fixtures';
import { applyServerMessage } from '../store/reducer';
import { createInitialState } from '../store/types';
import { result, snapshot } from '../testing/fixtures';
import { journalEntries } from '../testing/journal';
import { mockReducedMotion } from '../testing/ui';
import { Journal } from './Journal';

const entities = Object.fromEntries(
  snapshot.entities.map((node) => [node.id, node]),
);
const reveal = { beat: 1, status: 'revealing' } as const;
const props = { entries: journalEntries, entities, onToggle: vi.fn(), reveal };
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  mockReducedMotion();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('inks in stamps, narration, dialogue and event notes, then stops the timer', () => {
  const onRevealComplete = vi.fn();
  render(<Journal {...props} onRevealComplete={onRevealComplete} />);
  expect(
    screen.getByText('Search → success').classList.contains('stamping'),
  ).toBe(true);
  expect(screen.queryByText('One two three four.')).toBeNull();
  act(() => {
    vi.advanceTimersByTime(325);
  });
  expect(screen.getByText('One')).toBeTruthy();
  expect(screen.queryByText(/A clue/)).toBeNull();
  act(() => {
    vi.advanceTimersByTime(75);
  });
  expect(screen.getByText(/A clue/)).toBeTruthy();
  expect(screen.queryByText(/Leave that alone/)).toBeNull();
  act(() => {
    vi.advanceTimersByTime(450);
  });
  expect(screen.getByText(/Leave that alone/)).toBeTruthy();
  expect(screen.getByText('◆ Letter → your inventory')).toBeTruthy();
  expect(onRevealComplete).toHaveBeenCalledWith(1);
  expect(vi.getTimerCount()).toBe(0);
});
it.each(['click', 'key'])('%s reveals everything immediately', (method) => {
  render(<Journal {...props} />);
  if (method === 'click')
    fireEvent.click(screen.getByRole('region', { name: 'Journal' }));
  else fireEvent.keyDown(window, { key: 'Tab' });
  expect(screen.getByText('One two three four.')).toBeTruthy();
  expect(screen.getByText('◆ Letter → your inventory')).toBeTruthy();
  expect(document.querySelector('.stamping')).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});
it('renders instantly for reduced motion and responds to preference changes', () => {
  const setReduced = mockReducedMotion(true);
  const view = render(<Journal {...props} />);
  expect(screen.getByText('One two three four.')).toBeTruthy();
  expect(vi.getTimerCount()).toBe(0);
  act(() => setReduced(false));
  view.rerender(
    <Journal
      {...props}
      entries={journalEntries.map((entry) => ({ ...entry, beat: 2 }))}
      reveal={{ beat: 2, status: 'revealing' }}
    />,
  );
  expect(screen.queryByText('One two three four.')).toBeNull();
  act(() => setReduced(true));
  expect(screen.getByText('One two three four.')).toBeTruthy();
  expect(vi.getTimerCount()).toBe(0);
});
it('starts the next beat at zero after skipping and preserves progress across rerenders', () => {
  const view = render(<Journal {...props} />);
  fireEvent.keyDown(window, { key: 'a' });
  const next = journalEntries
    .filter((entry) => entry.beat === 1)
    .map((entry) => ({
      ...entry,
      id: `${entry.id}:2`,
      beat: 2,
    }));
  view.rerender(
    <Journal
      {...props}
      entries={next}
      reveal={{ beat: 2, status: 'revealing' }}
    />,
  );
  act(() => {
    vi.advanceTimersByTime(325);
  });
  view.rerender(
    <Journal
      {...props}
      entries={next}
      reveal={{ beat: 2, status: 'revealing' }}
      onToggle={vi.fn()}
    />,
  );
  expect(screen.getByText('One')).toBeTruthy();
  act(() => {
    vi.advanceTimersByTime(25);
  });
  expect(screen.getByText('One two')).toBeTruthy();
});
it('follows each new line, stays put when scrolled up and jumps via the new entries pill', () => {
  let height = 900;
  let top = 0;
  const view = render(<Journal {...props} />);
  const viewport = screen.getByRole('region', { name: 'Journal' });
  Object.defineProperties(viewport, {
    scrollHeight: { get: () => height },
    clientHeight: { get: () => 300 },
    scrollTop: {
      get: () => top,
      set: (value: number) => {
        top = Math.min(height - 300, value);
      },
    },
  });
  act(() => {
    vi.advanceTimersByTime(150);
  });
  expect(top).toBe(600);
  top = 100;
  fireEvent.scroll(viewport);
  height = 1000;
  act(() => {
    vi.advanceTimersByTime(175);
  });
  expect(top).toBe(100);
  fireEvent.click(screen.getByRole('button', { name: '↓ new entries' }));
  expect(top).toBe(700);
  expect(screen.queryByText('↓ new entries')).toBeNull();
  height = 1100;
  act(() => {
    vi.advanceTimersByTime(525);
  });
  expect(top).toBe(800);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it('does not show a new entries pill merely for scrolling up or unrelated rerenders', () => {
  const view = render(<Journal {...props} reveal={null} />);
  const viewport = screen.getByRole('region', { name: 'Journal' });
  Object.defineProperties(viewport, {
    scrollHeight: { value: 1000 },
    clientHeight: { value: 300 },
  });
  viewport.scrollTop = 100;
  fireEvent.scroll(viewport);
  view.rerender(<Journal {...props} reveal={null} onToggle={vi.fn()} />);
  expect(screen.queryByText('↓ new entries')).toBeNull();
});
it('renders provisional lines in lighter ink, finalises matches and strikes paused lines', () => {
  let state = applyServerMessage(createInitialState(), snapshot);
  state = applyServerMessage(state, {
    type: 'beat_progress',
    beat: 1,
    progress: { kind: 'peer_line', speaker: 'char:ilsa', text: 'A clue.' },
  });
  const view = render(
    <Journal {...props} {...state.journal} beat={state.beat} />,
  );
  expect(screen.getByText(/A clue/).closest('.provisional')).toBeTruthy();
  expect(
    screen.queryByText("The Dungeon Master's quill scratches…"),
  ).toBeNull();
  state = applyServerMessage(state, result());
  view.rerender(<Journal {...props} {...state.journal} beat={state.beat} />);
  expect(screen.getByText(/A clue/).closest('.final')).toBeTruthy();
  expect(screen.getAllByText(/A clue/)).toHaveLength(1);
  state = applyServerMessage(state, {
    type: 'beat_progress',
    beat: 2,
    progress: { kind: 'peer_line', speaker: 'char:ilsa', text: 'Wait.' },
  });
  state = applyServerMessage(state, {
    type: 'paused',
    beat: 2,
    reason: 'budget',
    attempt: 0,
    retryInMs: null,
  });
  view.rerender(<Journal {...props} {...state.journal} beat={state.beat} />);
  expect(screen.getByText('Wait.').tagName).toBe('S');
  expect(screen.getByText(/Paused: budget/)).toBeTruthy();
});
it('shows a quill fallback only while waiting for peer feedback', () => {
  render(
    <Journal
      {...props}
      beat={{
        number: 2,
        status: 'running',
        phase: null,
        toolCalls: null,
        startedAt: 0,
      }}
    />,
  );
  expect(
    screen.getByText("The Dungeon Master's quill scratches…"),
  ).toBeTruthy();
});
it('journal chips re-select their entity by click and Enter', () => {
  const onToggle = vi.fn();
  render(<Journal {...props} onToggle={onToggle} />);
  const chip = screen.getByRole('button', { name: 'Old box' });
  fireEvent.click(chip);
  fireEvent.keyDown(chip, { key: 'Enter' });
  expect(onToggle.mock.calls).toEqual([['container:box'], ['container:box']]);
});
it('adds the critic fallback trace link only in dev mode, leaving narration unchanged', () => {
  const onTrace = vi.fn();
  const traces = {
    'beat-1': beatTraceSchema.parse({ ...trace, outcome: 'fallback' }),
  };
  const view = render(
    <Journal {...props} reveal={null} traces={traces} onTrace={onTrace} />,
  );
  expect(screen.queryByText('critic fallback')).toBeNull();
  view.rerender(
    <Journal
      {...props}
      reveal={null}
      traces={traces}
      devTools
      onTrace={onTrace}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'critic fallback' }));
  expect(onTrace).toHaveBeenCalledWith('beat-1');
  expect(screen.getByText('One two three four.')).toBeTruthy();
});
it('renders the chapter-end placeholder and disables unavailable journal references', () => {
  render(
    <Journal
      {...props}
      reveal={null}
      entities={{}}
      entries={[
        ...journalEntries,
        {
          id: 'end',
          beat: 1,
          kind: 'episode_end',
          holder: 'char:player',
          text: 'The quill is safe.',
        },
      ]}
    />,
  );
  expect(screen.getByRole('heading', { name: 'End of chapter' })).toBeTruthy();
  expect(
    screen
      .getByRole('button', { name: 'container:box' })
      .hasAttribute('disabled'),
  ).toBe(true);
});
