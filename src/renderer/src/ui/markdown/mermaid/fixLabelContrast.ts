import { blend, colorBehind, parseColor, readableLabelColor, type Layer, type Rgb } from "./labelContrast";

/** 塗りのある形（文字の下になりうるもの）と文字 */
const SHAPES = new Set(["rect", "path", "polygon", "circle", "ellipse"]);
/** 描かれない入れ物（矢印の形・切り抜き・模様など）の中は数えない */
const NOT_DRAWN = "defs, marker, clipPath, pattern, mask, symbol";

/** 形の塗りの色（塗りと形の不透明度を掛ける）。塗りがない・透明なら null */
function fillOf(el: Element): Layer["color"] | null {
  const style = getComputedStyle(el);
  const color = parseColor(style.fill);
  if (!color) return null;
  const alpha = color.alpha * Number(style.fillOpacity || 1) * Number(style.opacity || 1);
  return alpha > 0 ? { rgb: color.rgb, alpha } : null;
}

/** 図の地の色（SVG に色がなければ、図を置く欄の色 base） */
function baseOf(root: SVGSVGElement, base: Rgb): Rgb {
  const color = parseColor(getComputedStyle(root).backgroundColor);
  return color ? blend(color.rgb, color.alpha, base) : base;
}

/**
 * 描いた図（SVG）の文字で、下に見える色との明暗差が足りないものを読める色に替える。
 * 図を書く側が塗り（style の fill・classDef・シーケンス図の rect / box）や文字色（linkStyle の color）だけを指定すると、
 * テーマの色と重なって読めなくなるため（サブグラフの見出しは style の color も効かない）。
 * 図の種類によらず、文字ごとに「先に描かれた塗った形のうち、文字の中心を含むもの」を上から重ねて下の色を求め、比べる。
 * ダーク・ライトのどちらでも、下の色の明るさだけで決める。色と位置は計算後の値で測るので、いったん見えない所に置く。
 * background: 図を置く欄の色（SVG に地の色がないとき、文字の下に何もなければこの色）
 */
export function fixLabelContrast(svg: string, background: string): string {
  const base = parseColor(background)?.rgb ?? [128, 128, 128];
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;";
  host.innerHTML = svg;
  document.body.appendChild(host);
  try {
    const root = host.querySelector("svg");
    if (!root) return svg;
    const ground = baseOf(root, base);
    // 描く順（文書の順）にたどり、文字ごとに、それより前の形だけを下の色に数える
    const layers: Layer[] = [];
    let changed = false;
    for (const el of root.querySelectorAll("*")) {
      const tag = el.localName;
      if (!SHAPES.has(tag) && tag !== "text") continue;
      if (el.closest(NOT_DRAWN)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (tag !== "text") {
        const color = fillOf(el);
        if (color) layers.push({ box: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }, color });
        continue;
      }
      const target = el.querySelector("tspan") ?? el;
      const text = parseColor(getComputedStyle(target).fill);
      if (!text) continue;
      const behind = colorBehind((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2, layers, ground);
      const color = readableLabelColor(behind, text.rgb);
      if (!color) continue;
      for (const node of [el, ...el.querySelectorAll("tspan")]) (node as SVGElement).style.setProperty("fill", color, "important");
      changed = true;
    }
    return changed ? new XMLSerializer().serializeToString(root) : svg;
  } finally {
    host.remove();
  }
}
