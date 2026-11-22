import { useLayoutEffect, useRef, useState } from 'react';
import type { ClientState } from '../store/types';

export function atJournalBottom(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
) {
  return scrollHeight - clientHeight - scrollTop <= 24;
}

export function useJournalScroll(
  contentKey: string,
  saved?: ClientState['journal']['scroll'],
  onSave?: (scroll: ClientState['journal']['scroll']) => void,
) {
  const viewport = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const following = useRef(saved?.following ?? true);
  const [hasNew, setHasNew] = useState(false);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const initial = useRef(saved);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (node && initial.current) node.scrollTop = initial.current.top;
  }, []);
  const save = () =>
    saveRef.current?.({
      top: viewport.current?.scrollTop ?? 0,
      following: following.current,
    });
  const jump = () => {
    const node = viewport.current;
    if (node) node.scrollTop = node.scrollHeight;
    following.current = true;
    setHasNew(false);
    save();
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
    save();
  };
  useLayoutEffect(() => {
    const update = () => {
      const node = viewport.current;
      if (!node) return;
      if (following.current) node.scrollTop = node.scrollHeight;
      else setHasNew(true);
      save();
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
