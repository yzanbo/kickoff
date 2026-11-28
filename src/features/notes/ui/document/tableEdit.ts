// 表のセルに書いた結果を、ファイルの表の文字へ書き戻す純粋な関数。
// ファイルの書き方を勝手に変えない: | の位置をそろえていない表（詰めた表）は書いた所だけを変え、そろえた表はそろえたまま書き戻す
import { splitTableRow, tableAligns, type ColumnAlign, type TableBlock, type TableRowSource } from "./tableBlocks";

/** 書き換え 1 つ（文の中の位置） */
export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

/**
 * セルに打った・貼った文を、表の形を壊さない書き方にする: | は \| に（すでに \ で消してあるものはそのまま）、改行は <br>（表の 1 行は改行できないため）
 */
export function escapeCellInput(insert: string): string {
  return insert.replace(/\r\n|\r|\n/g, "<br>").replace(/(\\*)\|/g, (all, slashes: string) => (slashes.length % 2 ? all : `${slashes}\\|`));
}

/** 行の中身の頭と終わりに | があるか */
function pipesOf(content: string): { lead: boolean; trail: boolean } {
  const trimmed = content.trim();
  return { lead: trimmed.startsWith("|"), trail: /(^|[^\\])(\\\\)*\|$/.test(trimmed) };
}

/**
 * その行に書いていない（見出しより短い行の足りない）セルに書いたとき、足りない | を足して書く。
 * 返すのは行の終わりに足す文と、書いたセルの中身の頭（文の中の位置）
 */
export function fillMissingCell(text: string, row: TableRowSource, col: number, typed: string): { change: TextChange; cellFrom: number } {
  const content = text.slice(row.from, row.to);
  const have = splitTableRow(content, row.from).length;
  const { trail } = pipesOf(content);
  const end = row.from + content.trimEnd().length;
  // 終わりに | がある行は「 |」を足して空のセルを作り、ない行は「 | 」で区切ってから書く
  const empties = " |".repeat(col - have);
  const insert = trail ? `${empties} ${typed} |` : `${" |".repeat(col - have + 1)} ${typed}`;
  const before = trail ? empties.length + 1 : (col - have + 1) * 2 + 1;
  return { change: { from: end, to: row.to, insert }, cellFrom: end + before };
}

/** 等幅の字体で 2 桁ぶんの幅の文字（日本語・中国語・韓国語の文字・全角の記号・絵文字） */
const WIDE = /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]|[\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/u;

/** 見た目の幅（桁。そろえた表は等幅の字体で | の位置がそろうように書かれる） */
export function displayWidth(value: string): number {
  let width = 0;
  for (const ch of value) width += WIDE.test(ch) ? 2 : 1;
  return width;
}

/** \ で消していない | の、行の中身の中の見た目の位置（桁） */
function pipePositions(content: string): number[] {
  const out: number[] = [];
  let column = 0;
  for (let i = 0; i < content.length; i++) {
    const c = content.charCodeAt(i);
    if (c === 92 && i + 1 < content.length) {
      column += 1 + displayWidth(content[i + 1]);
      i++;
      continue;
    }
    if (c === 124) out.push(column);
    // サロゲートの組は 2 つ目で数える
    if (c >= 0xd800 && c <= 0xdbff) continue;
    column += c >= 0xdc00 && c <= 0xdfff ? displayWidth(content.slice(i - 1, i + 1)) : displayWidth(content[i]);
  }
  return out;
}

/** | の位置をそろえた表か（どの行も | が同じ位置にあり、セルの間に 2 つ以上の |。1 行の表はそろえていない扱い） */
export function isAlignedTable(text: string, table: TableBlock): boolean {
  const rows = table.rows.map((r) => pipePositions(text.slice(r.from, r.to)).join(","));
  return rows.length > 1 && rows[0].split(",").length > 1 && rows.every((r) => r === rows[0]) && !alreadyCompact(text, table);
}

/** 詰めた書き方の区切りの行（|---|---|）なら、そろっていてもそろえない（列の中身がちょうど同じ長さの詰めた表） */
function alreadyCompact(text: string, table: TableBlock): boolean {
  const delimiter = table.rows.find((r) => r.delimiter);
  return !!delimiter && /^\|?(:?-{3}:?\|)+(:?-{3}:?)?$/.test(text.slice(delimiter.from, delimiter.to).trim());
}

/** 寄せに合わせて見た目の幅 width まで空白を足す */
function pad(value: string, width: number, align: ColumnAlign): string {
  const room = Math.max(0, width - displayWidth(value));
  if (align === "right") return " ".repeat(room) + value;
  if (align === "center") return " ".repeat(Math.floor(room / 2)) + value + " ".repeat(Math.ceil(room / 2));
  return value + " ".repeat(room);
}

/** 区切りの行のセル（幅 width・寄せの : 付き） */
function delimiterCell(width: number, align: ColumnAlign): string {
  const w = Math.max(3, width);
  if (align === "center") return `:${"-".repeat(w - 2)}:`;
  if (align === "left") return `:${"-".repeat(w - 1)}`;
  if (align === "right") return `${"-".repeat(w - 1)}:`;
  return "-".repeat(w);
}

/**
 * そろえた表の書き方で、表のすべての行を書き直す書き換え（変わる行だけ）。列の幅は列のいちばん広い中身の見た目の幅（区切りの行は 3 以上）。
 * 頭と終わりの | の有無は見出しの行に合わせる
 */
export function alignTableChanges(text: string, table: TableBlock): TextChange[] {
  const delimiter = table.rows.find((r) => r.delimiter);
  const aligns = delimiter ? tableAligns(text.slice(delimiter.from, delimiter.to)) : [];
  const cellsOf = (r: TableRowSource) => splitTableRow(text.slice(r.from, r.to), r.from).map((c) => text.slice(c.from, c.to));
  const body = table.rows.filter((r) => !r.delimiter);
  const columns = Math.max(...body.map((r) => cellsOf(r).length));
  const widths = Array.from({ length: columns }, (_, i) => Math.max(3, ...body.map((r) => displayWidth(cellsOf(r)[i] ?? ""))));
  const { lead, trail } = pipesOf(text.slice(body[0].from, body[0].to));
  const join = (cells: string[]) => `${lead ? "| " : ""}${cells.join(" | ")}${trail ? " |" : ""}`;
  const changes: TextChange[] = [];
  for (const r of table.rows) {
    const line = r.delimiter
      ? join(widths.map((w, i) => delimiterCell(w, aligns[i] ?? null)))
      : join(widths.map((w, i) => pad(cellsOf(r)[i] ?? "", w, aligns[i] ?? null)));
    if (line !== text.slice(r.from, r.to)) changes.push({ from: r.from, to: r.to, insert: line });
  }
  return changes;
}
