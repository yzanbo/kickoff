export type Rgb = readonly [number, number, number];

/** 色と不透明度（0〜1） */
export type Rgba = { rgb: Rgb; alpha: number };

/** 色（#rgb・#rrggbb・rgb()・rgba()）を読む。透明（a = 0）と読めない色は null */
export function parseColor(color: string): Rgba | null {
  const s = color.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    const n = parseInt(h, 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha: 1 };
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (!fn) return null;
  const alpha = fn[4] === undefined ? 1 : fn[4].endsWith("%") ? parseFloat(fn[4]) / 100 : parseFloat(fn[4]);
  if (!(alpha > 0)) return null;
  return { rgb: [Number(fn[1]), Number(fn[2]), Number(fn[3])], alpha: Math.min(1, alpha) };
}

/** 下の色 bottom の上に、色 top を不透明度 alpha で重ねた色 */
export function blendRgb(top: Rgb, alpha: number, bottom: Rgb): Rgb {
  const channel = (i: 0 | 1 | 2) => Math.round(top[i] * alpha + bottom[i] * (1 - alpha));
  return [channel(0), channel(1), channel(2)];
}

/** 相対輝度（WCAG 2） */
function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** 2 つの色の明暗差（1〜21） */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
