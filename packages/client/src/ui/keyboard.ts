import type { KeyboardEvent } from 'react';

export function activateOnEnter(event: KeyboardEvent<HTMLButtonElement>) {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
  event.preventDefault();
  if (!event.repeat) event.currentTarget.click();
}
