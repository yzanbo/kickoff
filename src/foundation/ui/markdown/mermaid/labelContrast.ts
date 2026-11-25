/**
 * 図の文字と、その下の色の明暗差（コントラスト）の計算。
 * 図を書く側が塗り（style の fill・classDef・シーケンス図の rect など）や文字色だけを指定すると、
 * テーマの色（ダークでは白い文字・ライトでは黒い文字）と重なって読めなくなるので、足りないときに読める文字色を選ぶのに使う
 */

import { blendRgb, contrastRatio, parseColor, type Rgb, type Rgba } from "@shared/foundation/theme/color";

/** 図の中の塗った形 1 つ（描く順に並べる）。box は画面の上の位置 */
export type Layer = { box: { left: number; top: number; right: number; bottom: number }; color: Rgba };

/** 足りないとみなす明暗差（これより小さければ文字色を替える。図を書いた側の色は、読める限りそのまま残す） */
const MIN_LABEL_CONTRAST = 3;

/** 替えるときの文字色（暗い地には明るい文字・明るい地には暗い文字） */
export const LABEL_TEXT_DARK = "#1f2328";
export const LABEL_TEXT_LIGHT = "#f5f5f5";

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
  for (let i = hits.length - 1; i >= 0; i--) result = blendRgb(hits[i].rgb, hits[i].alpha, result);
  return result;
}

const DARK = parseColor(LABEL_TEXT_DARK)!.rgb;
const LIGHT = parseColor(LABEL_TEXT_LIGHT)!.rgb;

/** 背景 background に重ねた文字 text が読めなければ、読める文字色を返す（読めるときは null で、替えない） */
export function readableLabelColor(background: Rgb, text: Rgb): string | null {
  if (contrastRatio(background, text) >= MIN_LABEL_CONTRAST) return null;
  return contrastRatio(background, DARK) >= contrastRatio(background, LIGHT) ? LABEL_TEXT_DARK : LABEL_TEXT_LIGHT;
}

/** 点 (x, y) が、塗った形のどれかの上にあるか（図を書く側が塗った地の上の線だけを直すため。地の色だけの所はテーマの色のまま） */
export function onLayer(x: number, y: number, layers: readonly Layer[]): boolean {
  return layers.some(({ box }) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom);
}

/**
 * 線（矢印など）の色 stroke が、線の通る所の下の色 backgrounds（線に沿って取った点ごと）のどこかで見えにくければ、
 * 通る所すべてでいちばん見える色（暗い / 明るい）を返す（見えるときは null で、替えない）。
 * 明るい塗りの上の白い線のように、図を書く側の塗りとテーマの線の色が重なって見えなくなるため
 */
export function readableStrokeColor(backgrounds: readonly Rgb[], stroke: Rgb): string | null {
  if (backgrounds.length === 0) return null;
  const worst = (rgb: Rgb) => Math.min(...backgrounds.map((bg) => contrastRatio(bg, rgb)));
  if (worst(stroke) >= MIN_LABEL_CONTRAST) return null;
  return worst(DARK) >= worst(LIGHT) ? LABEL_TEXT_DARK : LABEL_TEXT_LIGHT;
}
