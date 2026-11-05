import { parseColor, readableLabelColor } from "./labelContrast";

/** 文字を重ねる図形（箱・サブグラフの枠） */
const GROUPS = "g.node, g.cluster";
const SHAPES = "rect, path, polygon, circle, ellipse";

/** 図形の塗りの色（塗りのある最初の形。文字の中の形・入れ子の図形の形は除く）。塗りがなければ null */
function backgroundOf(group: Element): string | null {
  for (const shape of group.querySelectorAll(SHAPES)) {
    if (shape.closest(GROUPS) !== group || shape.closest("text, .label, .cluster-label")) continue;
    const fill = getComputedStyle(shape).fill;
    if (parseColor(fill)) return fill;
  }
  return null;
}

/**
 * 描いた図（SVG）の、箱・サブグラフの見出しの文字で、塗りとの明暗差が足りないものを読める色に替える。
 * 図を書く側が塗り（style の fill・classDef）だけを指定すると、テーマの文字色と重なって読めなくなるため
 * （サブグラフの見出しは style の color も効かない）。ダーク・ライトのどちらでも、塗りの明るさだけで決める。
 * 色は計算後のスタイル（図の中の <style> を含む）で比べるので、いったん見えない所に置いて測る
 */
export function fixLabelContrast(svg: string): string {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;";
  host.innerHTML = svg;
  document.body.appendChild(host);
  try {
    const root = host.querySelector("svg");
    if (!root) return svg;
    let changed = false;
    for (const group of root.querySelectorAll(GROUPS)) {
      const background = backgroundOf(group);
      if (!background) continue;
      for (const text of group.querySelectorAll("text")) {
        // 入れ子の図形（サブグラフの中の箱）の文字は、その図形で決める
        if (text.closest(GROUPS) !== group) continue;
        const target = text.querySelector("tspan") ?? text;
        const color = readableLabelColor(background, getComputedStyle(target).fill);
        if (!color) continue;
        for (const el of [text, ...text.querySelectorAll("tspan")]) (el as SVGElement).style.setProperty("fill", color, "important");
        changed = true;
      }
    }
    return changed ? new XMLSerializer().serializeToString(root) : svg;
  } finally {
    host.remove();
  }
}
