export const INK = 0x2b1d12;
export const RED_INK = 0x9b1c1c;
export const PAPER = '#f6ecd6';
export const ROLE_INK = { player: 0x4b2520, peer: 0x35424a, npc: INK };

export function recolourPixels(source: Uint8ClampedArray): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(source.length);
  for (let i = 0; i < source.length; i += 4) {
    const r = source[i] ?? 0;
    const g = source[i + 1] ?? 0;
    const b = source[i + 2] ?? 0;
    const alpha = source[i + 3] ?? 0;
    if (alpha < 128) continue;
    const colour = r > g + 40 && r > b + 40 ? RED_INK : INK;
    pixels[i] = colour >> 16;
    pixels[i + 1] = (colour >> 8) & 255;
    pixels[i + 2] = colour & 255;
    pixels[i + 3] = alpha;
  }
  return pixels;
}
