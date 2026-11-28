// ノートの中の表を見つけ、行ごとの場所と、表として描く Markdown を作る純粋な関数（置き換えて描く・セルで書くのに使う）
import type { SyntaxNode, Tree } from "@lezer/common";

/** 表の 1 行の場所（文の中の位置） */
export interface TableRowSource {
  /** 行の頭（入れ物の印・字下げの前） */
  lineFrom: number;
  /** 表の行の中身の頭（入れ物の印・字下げの後ろ） */
  from: number;
  /** 行の終わり（改行の手前） */
  to: number;
  /** 区切りの行（|---|）か */
  delimiter: boolean;
}

/** 文の中の表 1 つ */
export interface TableBlock {
  /** 最初の行の頭 */
  from: number;
  /** 最後の行の終わり */
  to: number;
  /** 見出しの行・区切りの行・本文の行（書いた順） */
  rows: TableRowSource[];
  /** 入れ物の印・字下げを除いた、表だけの Markdown（返答の表示と同じ処理で描く） */
  markdown: string;
  /** 最初の行の、表の前の印（リストの中の字下げ・引用の >） */
  prefix: string;
}

/** 表が入りうるまとまり（文の中は探さない） */
const CONTAINERS = new Set(["Document", "Blockquote", "BulletList", "OrderedList", "ListItem"]);

const blocksByTree = new WeakMap<Tree, { text: string; blocks: TableBlock[] }>();

function lineEnd(text: string, pos: number): number {
  const end = text.indexOf("\n", pos);
  return end < 0 ? text.length : end;
}

function blockOf(table: SyntaxNode, text: string): TableBlock {
  const rows: TableRowSource[] = [];
  for (let child = table.firstChild; child; child = child.nextSibling) {
    // 表の直下の TableDelimiter は区切りの行（セルの間の | は行の中にある）
    const delimiter = child.name === "TableDelimiter";
    if (child.name !== "TableHeader" && child.name !== "TableRow" && !delimiter) continue;
    rows.push({ lineFrom: text.lastIndexOf("\n", child.from - 1) + 1, from: child.from, to: lineEnd(text, child.from), delimiter });
  }
  const first = rows[0];
  return {
    from: first.lineFrom,
    to: rows[rows.length - 1].to,
    rows,
    markdown: rows.map((r) => text.slice(r.from, r.to)).join("\n"),
    prefix: text.slice(first.lineFrom, first.from),
  };
}

/** 文の中の表（書いた順）。同じ木と文には同じ結果を返す（飾りの組み立てで何度も呼ぶため） */
export function tableBlocks(tree: Tree, text: string): TableBlock[] {
  const known = blocksByTree.get(tree);
  if (known && known.text === text) return known.blocks;
  const blocks: TableBlock[] = [];
  const walk = (node: SyntaxNode) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.name === "Table") blocks.push(blockOf(child, text));
      else if (CONTAINERS.has(child.name)) walk(child);
    }
  };
  walk(tree.topNode);
  blocksByTree.set(tree, { text, blocks });
  return blocks;
}

/** 区切りの行から読む列の寄せ（: の付き方。付いていなければ null） */
export type ColumnAlign = "left" | "center" | "right" | null;

/** 表の 1 行のセル（文の中の位置。中身の前後の空白は含めない。空のセルは from と to が同じ） */
export interface TableCellSource {
  from: number;
  to: number;
}

/**
 * 表の 1 行をセルに分ける（offset は行の中身の頭の、文の中の位置）。区切りは \ で消していない |。頭と終わりの | はセルにしない。
 * 空のセルの位置は、左の | のすぐ後ろ（空白が 1 つあればその後ろ）
 */
export function splitTableRow(content: string, offset: number): TableCellSource[] {
  const pipes: number[] = [];
  for (let i = 0; i < content.length; i++) {
    const c = content.charCodeAt(i);
    if (c === 92) i++;
    else if (c === 124) pipes.push(i);
  }
  const bounds: [number, number][] = [];
  let start = 0;
  for (const p of pipes) {
    bounds.push([start, p]);
    start = p + 1;
  }
  bounds.push([start, content.length]);
  // 頭と終わりの | の外側（空白だけ）はセルでない
  if (bounds.length > 1 && content.slice(bounds[0][0], bounds[0][1]).trim() === "") bounds.shift();
  if (bounds.length > 1 && content.slice(bounds[bounds.length - 1][0], bounds[bounds.length - 1][1]).trim() === "") bounds.pop();
  return bounds.map(([a, b]) => {
    const raw = content.slice(a, b);
    const lead = raw.length - raw.trimStart().length;
    const body = raw.trim();
    if (!body) {
      const at = a + (raw.startsWith(" ") ? 1 : 0);
      return { from: offset + at, to: offset + at };
    }
    return { from: offset + a + lead, to: offset + a + lead + body.length };
  });
}

/** 区切りの行の中身から、列ごとの寄せ */
export function tableAligns(delimiterContent: string): ColumnAlign[] {
  return splitTableRow(delimiterContent, 0).map(({ from, to }) => {
    const cell = delimiterContent.slice(from, to);
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    return left && right ? "center" : right ? "right" : left ? "left" : null;
  });
}
