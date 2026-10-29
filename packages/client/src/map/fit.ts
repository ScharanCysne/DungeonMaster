export function integerFit(
  width: number,
  height: number,
  mapWidth: number,
  mapHeight: number,
) {
  // Below native size the host scrolls; fractional downscaling would blur pixels.
  const scale = Math.max(
    1,
    Math.floor(Math.min(width / mapWidth, height / mapHeight)),
  );
  return {
    scale,
    x: Math.max(0, Math.floor((width - mapWidth * scale) / 2)),
    y: Math.max(0, Math.floor((height - mapHeight * scale) / 2)),
  };
}
