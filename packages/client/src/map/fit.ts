// Whole-number scales keep every pixel the same size, so they win whenever at
// least 2× fits. Below that the map fills the frame with a fractional scale
// (nearest-neighbour), because 1× is too small to read on laptop windows.
// Below native size the host scrolls rather than shrinking the art.
export function mapFit(
  width: number,
  height: number,
  mapWidth: number,
  mapHeight: number,
) {
  const fill = Math.min(width / mapWidth, height / mapHeight);
  const whole = Math.floor(fill);
  const scale = whole >= 2 ? whole : Math.max(1, fill);
  return {
    scale,
    x: Math.max(0, Math.floor((width - mapWidth * scale) / 2)),
    y: Math.max(0, Math.floor((height - mapHeight * scale) / 2)),
  };
}
