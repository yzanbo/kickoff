// ER 図を 1 つの SVG の文にする（「画像で保存」の SVG と、PNG の元。画面の図（@xyflow/react の HTML）を写すのではなく、箱の位置・大きさと関係から描き直す）。React に依らない
import type { ErCardinality } from "@shared/database/erDiagram";
import { ER_HEAD_HEIGHT, ER_PAD, ER_ROW_HEIGHT } from "./erBox";

export interface ErSvgColumn {
  name: string;
  type: string;
  primaryKey: boolean;
  foreignKey: boolean;
  nullable: boolean;
}

/** 箱（位置と大きさは画面の図のまま） */
export interface ErSvgBox {
  name: string;
  view: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  columns: ErSvgColumn[];
}

/** 線（from = 外部キーを持つ子、to = 指される親。列を出していなければ見出しにつなぐ） */
export interface ErSvgLine {
  from: string;
  to: string;
  fromColumn: string | null;
  toColumn: string | null;
  inferred: boolean;
  cardinality: ErCardinality;
}

/** 色（画面のテーマの CSS の変数から読んで渡す） */
export interface ErSvgColors {
  background: string;
  box: string;
  head: string;
  border: string;
  text: string;
  muted: string;
  edge: string;
  key: string;
  /** 図のまわりの枠の色（本番の接続の環境の色。画面の図と同じく、保存した画像でも本番だと分かるように）。なければ枠なし */
  frame?: string | null;
}

const MARGIN = 24;
const FONT = "-apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Helvetica Neue', sans-serif";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (n: number) => String(Math.round(n * 10) / 10);

/** 箱の中でその列の行の真ん中の高さ（列がない・出していなければ見出しの真ん中） */
function rowY(box: ErSvgBox, column: string | null): number {
  const i = column === null ? -1 : box.columns.findIndex((c) => c.name === column);
  if (i < 0) return box.y + ER_HEAD_HEIGHT / 2;
  return box.y + ER_HEAD_HEIGHT + ER_PAD / 2 + i * ER_ROW_HEIGHT + ER_ROW_HEIGHT / 2;
}

function boxSvg(b: ErSvgBox, c: ErSvgColors): string {
  const parts = [
    `<g>`,
    `<rect x="${num(b.x)}" y="${num(b.y)}" width="${num(b.width)}" height="${num(b.height)}" rx="4" fill="${c.box}" stroke="${c.border}"/>`,
    `<path d="M${num(b.x + 0.5)} ${num(b.y + ER_HEAD_HEIGHT)}H${num(b.x + b.width - 0.5)}" stroke="${c.border}"/>`,
    `<rect x="${num(b.x + 0.5)}" y="${num(b.y + 0.5)}" width="${num(b.width - 1)}" height="${ER_HEAD_HEIGHT - 1}" rx="3.5" fill="${c.head}"/>`,
    `<text x="${num(b.x + 10)}" y="${num(b.y + ER_HEAD_HEIGHT / 2)}" dominant-baseline="central" font-weight="600"${b.view ? ` font-style="italic"` : ""} fill="${c.text}">${esc(b.name)}</text>`,
  ];
  b.columns.forEach((col) => {
    const y = rowY(b, col.name);
    const mark = col.primaryKey ? "PK" : col.foreignKey ? "FK" : "";
    if (mark) parts.push(`<text x="${num(b.x + 8)}" y="${num(y)}" dominant-baseline="central" font-size="9" font-weight="600" fill="${col.primaryKey ? c.key : c.muted}">${mark}</text>`);
    parts.push(`<text x="${num(b.x + 28)}" y="${num(y)}" dominant-baseline="central" fill="${c.text}">${esc(col.name)}</text>`);
    const type = `${col.type}${col.nullable && !col.primaryKey ? "?" : ""}`;
    if (type) parts.push(`<text x="${num(b.x + b.width - 10)}" y="${num(y)}" dominant-baseline="central" text-anchor="end" font-size="11" fill="${c.muted}">${esc(type)}</text>`);
  });
  parts.push(`</g>`);
  return parts.join("");
}

/** 端の印（カラスの足の記法）: dir は線が箱から出ていく向き（右 = 1 / 左 = -1） */
function endMarks(x: number, y: number, dir: 1 | -1, kind: "many" | "one" | "required" | "optional"): string {
  const at = (dx: number) => num(x + dx * dir);
  const bar = (dx: number) => `M${at(dx)} ${num(y - 6)}V${num(y + 6)}`;
  if (kind === "many") return `M${at(12)} ${num(y)}L${at(0)} ${num(y - 6)}M${at(12)} ${num(y)}L${at(0)} ${num(y + 6)}${bar(15)}`;
  if (kind === "one") return bar(10);
  if (kind === "required") return `${bar(8)}${bar(13)}`;
  return bar(8);
}

function lineSvg(l: ErSvgLine, boxes: ReadonlyMap<string, ErSvgBox>, c: ErSvgColors): string {
  const a = boxes.get(l.from);
  const b = boxes.get(l.to);
  if (!a || !b || l.from === l.to) return "";
  // 子が親より左なら、子の右から親の左へ（画面の図と同じ決め方）
  const rightward = a.x + a.width / 2 <= b.x + b.width / 2;
  const sx = rightward ? a.x + a.width : a.x;
  const tx = rightward ? b.x : b.x + b.width;
  const sy = rowY(a, l.fromColumn);
  const ty = rowY(b, l.toColumn);
  const out: 1 | -1 = rightward ? 1 : -1;
  const mid = (sx + tx) / 2;
  const dash = l.inferred ? ` stroke-dasharray="5 4"` : "";
  const path = `<path d="M${num(sx)} ${num(sy)}H${num(mid)}V${num(ty)}H${num(tx)}" fill="none" stroke="${c.edge}" stroke-width="1.2"${dash}/>`;
  const marks = endMarks(sx, sy, out, l.cardinality.child) + endMarks(tx, ty, out === 1 ? -1 : 1, l.cardinality.parent);
  return `${path}<path d="${marks}" fill="none" stroke="${c.edge}" stroke-width="1.2"/>`;
}

/** 箱と線から SVG の文を作る（全体を余白つきで収める。箱がなければ小さな空の図） */
export function erSvg(boxes: readonly ErSvgBox[], lines: readonly ErSvgLine[], colors: ErSvgColors): { svg: string; width: number; height: number } {
  const minX = Math.min(...boxes.map((b) => b.x), 0) - MARGIN;
  const minY = Math.min(...boxes.map((b) => b.y), 0) - MARGIN;
  const maxX = Math.max(...boxes.map((b) => b.x + b.width), 0) + MARGIN;
  const maxY = Math.max(...boxes.map((b) => b.y + b.height), 0) + MARGIN;
  const width = Math.ceil(maxX - minX);
  const height = Math.ceil(maxY - minY);
  const byName = new Map(boxes.map((b) => [b.name, b]));
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${num(minX)} ${num(minY)} ${width} ${height}" font-family="${esc(FONT)}" font-size="12">`,
    `<rect x="${num(minX)}" y="${num(minY)}" width="${width}" height="${height}" fill="${colors.background}"/>`,
    ...lines.map((l) => lineSvg(l, byName, colors)),
    ...boxes.map((b) => boxSvg(b, colors)),
    ...(colors.frame ? [`<rect x="${num(minX + 3)}" y="${num(minY + 3)}" width="${width - 6}" height="${height - 6}" fill="none" stroke="${colors.frame}" stroke-width="6"/>`] : []),
    `</svg>`,
  ].join("\n");
  return { svg, width, height };
}
