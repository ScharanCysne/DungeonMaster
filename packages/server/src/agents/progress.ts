export function notifyProgress<T>(
  callback: ((value: T) => void) | undefined,
  value: T,
): void {
  try {
    callback?.(value);
  } catch {
    // An observer failure must not change the beat's outcome.
  }
}
