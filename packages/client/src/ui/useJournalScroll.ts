import { useLayoutEffect, useRef, useState } from 'react';

export function atJournalBottom(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
) {
  return scrollHeight - clientHeight - scrollTop <= 24;
}

export function useJournalScroll(contentKey: string) {
  const viewport = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [hasNew, setHasNew] = useState(false);
  const jump = () => {
    const node = viewport.current;
    if (node) node.scrollTop = node.scrollHeight;
    following.current = true;
    setHasNew(false);
  };
  const onScroll = () => {
    const node = viewport.current;
    if (!node) return;
    following.current = atJournalBottom(
      node.scrollTop,
      node.clientHeight,
      node.scrollHeight,
    );
    if (following.current) setHasNew(false);
  };
  useLayoutEffect(() => {
    const update = () => {
      const node = viewport.current;
      if (!node) return;
      if (following.current) node.scrollTop = node.scrollHeight;
      else setHasNew(true);
    };
    update();
    // Fonts, wrapping and portraits can change height after the text has rendered.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    if (content.current) observer.observe(content.current);
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [contentKey]);
  return { viewport, content, hasNew, jump, onScroll };
}
