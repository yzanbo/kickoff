/**
 * 図の文字と背景の明暗差（コントラスト）の計算。
 * 図を書く側が塗り（style の fill・classDef）だけを指定すると、テーマの文字色（ダークでは白・ライトでは黒）と重なって読めなくなるので、
 * 足りないときに読める文字色を選ぶのに使う
 */

type Rgb = [number, number, number];

/** 足りないとみなす明暗差（これより小さければ文字色を替える。図を書いた側の色は、読める限りそのまま残す） */
export const MIN_LABEL_CONTRAST = 3;

/** 替えるときの文字色（暗い地には明るい文字・明るい地には暗い文字） */
export const LABEL_TEXT_DARK = "#1f2328";
export const LABEL_TEXT_LIGHT = "#f5f5f5";

/** 色（#rgb・#rrggbb・rgb()・rgba()）を読む。透明（a = 0）と読めない色は null */
export function parseColor(color: string): Rgb | null {
  const s = color.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (!fn) return null;
  const alpha = fn[4] === undefined ? 1 : fn[4].endsWith("%") ? parseFloat(fn[4]) / 100 : parseFloat(fn[4]);
  if (alpha === 0) return null;
  return [Number(fn[1]), Number(fn[2]), Number(fn[3])];
}

/** 相対輝度（WCAG 2） */
function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** 2 つの色の明暗差（1〜21）。読めない色があれば null */
export function contrastRatio(a: string, b: string): number | null {
  const pa = parseColor(a);
  const pb = parseColor(b);
  if (!pa || !pb) return null;
  const [hi, lo] = [luminance(pa), luminance(pb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * 背景 background に重ねた文字 text が読めなければ、読める文字色を返す（読めるとき・色が読めないときは null で、替えない）
 */
export function readableLabelColor(background: string, text: string): string | null {
  const current = contrastRatio(background, text);
  if (current === null || current >= MIN_LABEL_CONTRAST) return null;
  const dark = contrastRatio(background, LABEL_TEXT_DARK) ?? 0;
  const light = contrastRatio(background, LABEL_TEXT_LIGHT) ?? 0;
  return dark >= light ? LABEL_TEXT_DARK : LABEL_TEXT_LIGHT;
}
