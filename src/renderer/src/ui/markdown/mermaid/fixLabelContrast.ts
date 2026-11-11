import { blend, colorBehind, onLayer, parseColor, readableLabelColor, readableStrokeColor, type Layer, type Rgb } from "./labelContrast";

/** 塗りのある形（文字の下になりうるもの）と文字 */
const SHAPES = new Set(["rect", "path", "polygon", "circle", "ellipse"]);
/** 線になりうる形（塗りがなく線だけのもの。矢印・メッセージの線・つなぐ線） */
const STROKES = new Set(["line", "path", "polyline"]);
/** 描かれない入れ物（矢印の形・切り抜き・模様など）の中は数えない */
const NOT_DRAWN = "defs, marker, clipPath, pattern, mask, symbol";
/** 線に沿って下の色を見る点の数 */
const STROKE_SAMPLES = 9;
/** 線の先の形（矢印の頭など）を指す CSS の項目 */
const MARKER_PROPS = ["marker-start", "marker-mid", "marker-end"] as const;

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

/** 線に沿った点（画面の上の位置。長さがない・測れなければ空） */
function pointsAlong(el: SVGGeometryElement): { x: number; y: number }[] {
  const total = el.getTotalLength();
  const ctm = el.getScreenCTM();
  if (!(total > 0) || !ctm) return [];
  return Array.from({ length: STROKE_SAMPLES }, (_, i) => {
    const p = el.getPointAtLength((total * (i + 0.5)) / STROKE_SAMPLES);
    return new DOMPoint(p.x, p.y).matrixTransform(ctm);
  });
}

/**
 * 線の先の形（矢印の頭）を、その色で塗った写しにして指し直す（矢印の頭は図の中の線で共有しているので、写しを作って、この線だけを替える）。
 * 同じ形・同じ色の写しは使い回す
 */
function recolorMarkers(root: SVGSVGElement, el: SVGElement, color: string, made: Map<string, string>) {
  for (const prop of MARKER_PROPS) {
    const id = /url\(["']?#([^"')]+)["']?\)/.exec(getComputedStyle(el).getPropertyValue(prop))?.[1];
    if (!id) continue;
    const key = `${id}|${color}`;
    let copyId = made.get(key);
    if (!copyId) {
      const marker = root.querySelector(`marker[id="${CSS.escape(id)}"]`);
      if (!marker) continue;
      const copy = marker.cloneNode(true) as SVGMarkerElement;
      copyId = `${id}-readable-${made.size}`;
      copy.id = copyId;
      const selector = "path, polygon, circle, ellipse, rect, line, polyline";
      const originals = [...marker.querySelectorAll(selector)];
      copy.querySelectorAll<SVGElement>(selector).forEach((shape, i) => {
        // 塗りのある形は塗りも替え、線だけの形（塗りなし）は線の色だけを替える（写しは文書の外なので、計算後の値は元の形で見る）
        if (originals[i] && parseColor(getComputedStyle(originals[i]).fill)) shape.style.setProperty("fill", color, "important");
        shape.style.setProperty("stroke", color, "important");
      });
      marker.after(copy);
      made.set(key, copyId);
    }
    el.style.setProperty(prop, `url(#${copyId})`, "important");
  }
}

/**
 * 描いた図（SVG）の文字と線で、下に見える色との明暗差が足りないものを読める色に替える。
 * 図を書く側が塗り（style の fill・classDef・シーケンス図の rect / box）や文字色（linkStyle の color）だけを指定すると、
 * テーマの色と重なって読めなくなるため（サブグラフの見出しは style の color も効かない。ダークのテーマでは、明るい rect の上の白い矢印が見えなくなる）。
 * 図の種類によらず、文字ごとに「先に描かれた塗った形のうち、文字の中心を含むもの」を上から重ねて下の色を求め、比べる。
 * 線（塗りのない line・path・polyline）は、線に沿って取った点の大半が塗った形の上にあるときだけ、その点ごとの下の色と比べ、
 * 見えにくければ線と矢印の頭の色を替える（塗っていない地の上の線はテーマの色のまま）。
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
    // 描く順（文書の順）にたどり、文字・線ごとに、それより前の形だけを下の色に数える
    const layers: Layer[] = [];
    const markers = new Map<string, string>();
    let changed = false;
    for (const el of root.querySelectorAll("*")) {
      const tag = el.localName;
      if (!SHAPES.has(tag) && !STROKES.has(tag) && tag !== "text") continue;
      if (el.closest(NOT_DRAWN)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (tag === "text") {
        const target = el.querySelector("tspan") ?? el;
        const text = parseColor(getComputedStyle(target).fill);
        if (!text) continue;
        const behind = colorBehind((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2, layers, ground);
        const color = readableLabelColor(behind, text.rgb);
        if (!color) continue;
        for (const node of [el, ...el.querySelectorAll("tspan")]) (node as SVGElement).style.setProperty("fill", color, "important");
        changed = true;
        continue;
      }
      const fill = SHAPES.has(tag) ? fillOf(el) : null;
      if (fill) {
        layers.push({ box: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }, color: fill });
        continue;
      }
      // 塗りのない線: 塗った形の上を通るときだけ、下の色と比べる
      const stroke = parseColor(getComputedStyle(el).stroke);
      if (!stroke || !STROKES.has(tag)) continue;
      const onShapes = pointsAlong(el as SVGGeometryElement).filter((p) => onLayer(p.x, p.y, layers));
      if (onShapes.length * 2 <= STROKE_SAMPLES) continue;
      const color = readableStrokeColor(onShapes.map((p) => colorBehind(p.x, p.y, layers, ground)), stroke.rgb);
      if (!color) continue;
      (el as SVGElement).style.setProperty("stroke", color, "important");
      recolorMarkers(root, el as SVGElement, color, markers);
      changed = true;
    }
    return changed ? new XMLSerializer().serializeToString(root) : svg;
  } finally {
    host.remove();
  }
}
