// CSV・TSV の取り込み（段階 3）: 文を行とセルに分け、テーブルの列に当てて、足す行にする。React に依らない
import type { DbEditValue } from "@shared/types";

export const CSV_DELIMITERS = [",", "\t", ";"] as const;
export type CsvDelimiter = (typeof CSV_DELIMITERS)[number];
export const CSV_DELIMITER_LABELS: Record<CsvDelimiter, string> = { ",": "カンマ", "\t": "タブ", ";": "セミコロン" };

/** 1 行目に多く出てくる区切り（囲みの中は数えない。どれもなければカンマ） */
export function detectDelimiter(text: string): CsvDelimiter {
  const counts: Record<CsvDelimiter, number> = { ",": 0, "\t": 0, ";": 0 };
  let quoted = false;
  for (const ch of text.replace(/^﻿/, "")) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted && ch in counts) counts[ch as CsvDelimiter]++;
  }
  return CSV_DELIMITERS.reduce((best, d) => (counts[d] > counts[best] ? d : best), ",");
}

/**
 * 区切りの文を行とセルに分ける（"…" で囲めば区切り・改行も含められ、"" は " 1 つ。改行は CRLF・LF・CR。頭の BOM と、終わりの改行は除く）
 */
export function parseDelimited(text: string, delimiter: CsvDelimiter): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (src[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** 取り込む形にした結果 */
export interface CsvMapped {
  /** 足す行（当てた列だけ） */
  rows: Record<string, DbEditValue>[];
  /** CSV の列ごとの、当てたテーブルの列（当てられなければ null） */
  mapping: (string | null)[];
  /** テーブルにない見出し */
  unknown: string[];
}

/**
 * CSV の行をテーブルの列に当てる。header なら 1 行目の見出しを列の名前に（大文字・小文字と前後の空白は見ない）、
 * なければ左から順に。空のセルは emptyAsNull なら NULL、でなければ空の文字。すべて空の行は飛ばす
 */
export function mapCsvRows(table: string[][], columns: string[], header: boolean, emptyAsNull: boolean): CsvMapped {
  const width = Math.max(0, ...table.map((r) => r.length));
  const byName = new Map(columns.map((c) => [c.trim().toLowerCase(), c]));
  const heads = header ? (table[0] ?? []) : [];
  const mapping = Array.from({ length: width }, (_, i) => (header ? (byName.get((heads[i] ?? "").trim().toLowerCase()) ?? null) : (columns[i] ?? null)));
  const unknown = header ? heads.filter((h, i) => h.trim() !== "" && mapping[i] === null) : [];
  const rows: Record<string, DbEditValue>[] = [];
  for (const cells of header ? table.slice(1) : table) {
    if (cells.every((c) => c === "")) continue;
    const values: Record<string, DbEditValue> = {};
    mapping.forEach((col, i) => {
      if (!col) return;
      const cell = cells[i] ?? "";
      values[col] = cell === "" && emptyAsNull ? null : cell;
    });
    rows.push(values);
  }
  return { rows, mapping, unknown };
}
