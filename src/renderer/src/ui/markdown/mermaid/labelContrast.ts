/**
 * 図の文字と、その下の色の明暗差（コントラスト）の計算。
 * 図を書く側が塗り（style の fill・classDef・シーケンス図の rect など）や文字色だけを指定すると、
 * テーマの色（ダークでは白い文字・ライトでは黒い文字）と重なって読めなくなるので、足りないときに読める文字色を選ぶのに使う
 */

export type Rgb = [number, number, number];

/** 色と不透明度（0〜1） */
export type Rgba = { rgb: Rgb; alpha: number };

/** 図の中の塗った形 1 つ（描く順に並べる）。box は画面の上の位置 */
export type Layer = { box: { left: number; top: number; right: number; bottom: number }; color: Rgba };

/** 足りないとみなす明暗差（これより小さければ文字色を替える。図を書いた側の色は、読める限りそのまま残す） */
const MIN_LABEL_CONTRAST = 3;

/** 替えるときの文字色（暗い地には明るい文字・明るい地には暗い文字） */
export const LABEL_TEXT_DARK = "#1f2328";
export const LABEL_TEXT_LIGHT = "#f5f5f5";

/** 色（#rgb・#rrggbb・rgb()・rgba()）を読む。透明（a = 0）と読めない色（none・url() など）は null */
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
export function blend(top: Rgb, alpha: number, bottom: Rgb): Rgb {
  return [0, 1, 2].map((i) => Math.round(top[i] * alpha + bottom[i] * (1 - alpha))) as Rgb;
}

/**
 * 点 (x, y) の下に見える色。layers は描く順（後ろほど上）に並べた塗った形で、点を含むものを上から重ねていく
 * （不透明な形に着いたらそこまで。どれにも含まれなければ地の色 base）
 */
export function colorBehind(x: number, y: number, layers: readonly Layer[], base: Rgb): Rgb {
  const hits: Rgba[] = [];
  for (let i = layers.length - 1; i >= 0; i--) {
    const { box, color } = layers[i];
    if (x < box.left || x > box.right || y < box.top || y > box.bottom) continue;
    hits.push(color);
    if (color.alpha >= 1) break;
  }
  let result = base;
  for (let i = hits.length - 1; i >= 0; i--) result = blend(hits[i].rgb, hits[i].alpha, result);
  return result;
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
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const DARK = parseColor(LABEL_TEXT_DARK)!.rgb;
const LIGHT = parseColor(LABEL_TEXT_LIGHT)!.rgb;

/** 背景 background に重ねた文字 text が読めなければ、読める文字色を返す（読めるときは null で、替えない） */
export function readableLabelColor(background: Rgb, text: Rgb): string | null {
  if (contrastRatio(background, text) >= MIN_LABEL_CONTRAST) return null;
  return contrastRatio(background, DARK) >= contrastRatio(background, LIGHT) ? LABEL_TEXT_DARK : LABEL_TEXT_LIGHT;
}
