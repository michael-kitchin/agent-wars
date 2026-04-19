/**
 * Small canvas color helpers shared by terrain fills and res4 city overlay strokes.
 * When to use: Anywhere a hex stroke/fill needs an `rgba(...)` string from a `#rgb` / `#rrggbb` source (terrain outlines, city label halos, city marker rims).
 */

/**
 * Converts `#rgb` / `#rrggbb` colors to `rgba(r,g,b,alpha)`; returns the input unchanged when parsing is unsafe.
 * When to use: Semi-transparent strokes (terrain outlines, city label halos, city marker rims).
 * Expected outcome: Alpha clamped to [0,1]; 3-digit hex expands per CSS shorthand rules.
 * Exceptions: None.
 */
export function withOpacityHex(color: string, alpha: number): string {
  const normalizedAlpha = Math.max(0, Math.min(1, alpha));
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      const r = Number.parseInt(`${hex[0]}${hex[0]}`, 16);
      const g = Number.parseInt(`${hex[1]}${hex[1]}`, 16);
      const b = Number.parseInt(`${hex[2]}${hex[2]}`, 16);
      return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
    }
    if (hex.length === 6) {
      const r = Number.parseInt(hex.slice(0, 2), 16);
      const g = Number.parseInt(hex.slice(2, 4), 16);
      const b = Number.parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
    }
  }
  return color;
}
