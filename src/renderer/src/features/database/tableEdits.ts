// テーブルのデータの、まだ保存していない変更（段階 3 のセルの編集・行の追加と削除・CSV の取り込み）。React に依らない。
// 行は読んだときのキー（主キーか、NULL を許さない一意の列の組）の値で指し、保存するときに DbRowEdit にする（SQL はコアが作る）
import type { DbColumnInfo, DbEditValue, DbKeyValue, DbRowEdit, DbValue } from "@shared/types";

/** 足す行（id は画面の中だけの番号） */
export interface TableInsert {
  id: number;
  /** 入れた列だけ（ない列は DB の既定値） */
  values: Record<string, DbEditValue>;
}

/** まだ保存していない変更 */
export interface TableEdits {
  /** 行のキー（rowKey の JSON）→ 列 → 新しい値 */
  changes: Record<string, Record<string, DbEditValue>>;
  /** 消す行のキー */
  deletes: string[];
  inserts: TableInsert[];
}

export const NO_EDITS: TableEdits = { changes: {}, deletes: [], inserts: [] };

/** 行を指すキー（キーの列の値の並びの JSON）。キーの列がない・値がバイナリなら null（その行は書き換えられない） */
export function rowKey(columns: DbColumnInfo[], row: DbValue[], keyColumns: string[] | null): string | null {
  if (!keyColumns) return null;
  const values: DbKeyValue[] = [];
  for (const name of keyColumns) {
    const i = columns.findIndex((c) => c.name === name);
    if (i < 0) return null;
    const v = row[i];
    if (v !== null && typeof v === "object") return null;
    values.push(v);
  }
  return JSON.stringify(values);
}

/** 書き直すときに欄に入れる文（NULL は空。バイナリは書き換えられないので null） */
export function editableText(value: DbValue): string | null {
  if (value === null) return "";
  if (typeof value === "object") return null;
  return String(value);
}

/** 読んだ値と同じか（同じに戻したら、変更を消す） */
function sameValue(original: DbValue, value: DbEditValue): boolean {
  if (original === null || value === null) return original === value;
  return typeof original !== "object" && String(original) === value;
}

/** セルを書き換える（読んだ値に戻したら、その変更を消す） */
export function setCell(edits: TableEdits, key: string, column: string, value: DbEditValue, original: DbValue): TableEdits {
  const row = { ...edits.changes[key] };
  if (sameValue(original, value)) delete row[column];
  else row[column] = value;
  const changes = { ...edits.changes };
  if (Object.keys(row).length === 0) delete changes[key];
  else changes[key] = row;
  return { ...edits, changes };
}

/** セルの変更を戻す */
export function revertCell(edits: TableEdits, key: string, column: string): TableEdits {
  if (!edits.changes[key] || !(column in edits.changes[key])) return edits;
  const row = { ...edits.changes[key] };
  delete row[column];
  const changes = { ...edits.changes };
  if (Object.keys(row).length === 0) delete changes[key];
  else changes[key] = row;
  return { ...edits, changes };
}

/** 行を消す / 消すのをやめる（書き換えたセルは残す。消す行の更新は送らない） */
export function toggleDelete(edits: TableEdits, key: string): TableEdits {
  const deletes = edits.deletes.includes(key) ? edits.deletes.filter((k) => k !== key) : [...edits.deletes, key];
  return { ...edits, deletes };
}

/** 行を足す（values: 入れる列。足した行の id も返す） */
export function addInserts(edits: TableEdits, rows: Record<string, DbEditValue>[]): TableEdits {
  let next = edits.inserts.reduce((m, r) => Math.max(m, r.id), 0);
  return { ...edits, inserts: [...edits.inserts, ...rows.map((values) => ({ id: ++next, values }))] };
}

/** 足す行のセルを書く（undefined なら既定値に戻す） */
export function setInsertCell(edits: TableEdits, id: number, column: string, value: DbEditValue | undefined): TableEdits {
  return {
    ...edits,
    inserts: edits.inserts.map((r) => {
      if (r.id !== id) return r;
      const values = { ...r.values };
      if (value === undefined) delete values[column];
      else values[column] = value;
      return { ...r, values };
    }),
  };
}

/** 足す行を外す */
export function removeInsert(edits: TableEdits, id: number): TableEdits {
  return { ...edits, inserts: edits.inserts.filter((r) => r.id !== id) };
}

/** 変更の数（書き換えた行・足す行・消す行。消す行の書き換えは数えない） */
export function editCounts(edits: TableEdits): { updates: number; inserts: number; deletes: number; total: number } {
  const deleted = new Set(edits.deletes);
  const updates = Object.keys(edits.changes).filter((k) => !deleted.has(k)).length;
  return { updates, inserts: edits.inserts.length, deletes: edits.deletes.length, total: updates + edits.inserts.length + edits.deletes.length };
}

/** 保存で送る形にする（消す → 書き換える → 足すの順。消す行の書き換えは送らない） */
export function buildEdits(edits: TableEdits, keyColumns: string[] | null): DbRowEdit[] {
  const keyOf = (json: string): Record<string, DbKeyValue> => {
    if (!keyColumns) throw new Error("行を指すキーがありません");
    const values = JSON.parse(json) as DbKeyValue[];
    return Object.fromEntries(keyColumns.map((c, i) => [c, values[i]]));
  };
  const deleted = new Set(edits.deletes);
  return [
    ...edits.deletes.map((k): DbRowEdit => ({ kind: "delete", key: keyOf(k) })),
    ...Object.entries(edits.changes)
      .filter(([k]) => !deleted.has(k))
      .map(([k, values]): DbRowEdit => ({ kind: "update", key: keyOf(k), values })),
    ...edits.inserts.map((r): DbRowEdit => ({ kind: "insert", values: r.values })),
  ];
}

/** 表に出す 1 行の様子 */
export type TableRowState = "deleted" | "added" | null;
/** 表に出す 1 つのセルの様子（書き換えた / 足す行で入れていない = 既定値） */
export type TableCellState = "changed" | "default" | null;

/** 表に出す行（読んだ行に書き換えを重ね、足す行を後ろに並べる） */
export interface TableDisplay {
  rows: DbValue[][];
  /** 行ごとの、読んだ行のキー（書き換えられない行は null。足す行は null） */
  keys: (string | null)[];
  /** 行ごとの、足す行の id（読んだ行は null） */
  insertIds: (number | null)[];
  rowState: (row: number) => TableRowState;
  cellState: (row: number, col: number) => TableCellState;
}

/** 書き換えた値の見せ方（数の列に数を入れたら、数のまま右に寄せる） */
function shownValue(original: DbValue, value: DbEditValue): DbValue {
  if (typeof original === "number" && value !== null && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return value;
}

/** 表に出す行を作る */
export function displayRows(columns: DbColumnInfo[], rows: DbValue[][], keyColumns: string[] | null, edits: TableEdits): TableDisplay {
  const keys = rows.map((row) => rowKey(columns, row, keyColumns));
  const deleted = new Set(edits.deletes);
  const shown = rows.map((row, i) => {
    const change = keys[i] ? edits.changes[keys[i]] : undefined;
    return change ? row.map((v, c) => (columns[c].name in change ? shownValue(v, change[columns[c].name]) : v)) : row;
  });
  const added = edits.inserts.map((r) => columns.map((c) => (c.name in r.values ? r.values[c.name] : null)));
  const insertIds = [...rows.map(() => null), ...edits.inserts.map((r) => r.id)];
  return {
    rows: added.length > 0 ? [...shown, ...added] : shown,
    keys: added.length > 0 ? [...keys, ...edits.inserts.map(() => null)] : keys,
    insertIds,
    rowState: (row) => (row >= rows.length ? "added" : keys[row] && deleted.has(keys[row]) ? "deleted" : null),
    cellState: (row, col) => {
      const name = columns[col]?.name;
      if (name === undefined) return null;
      if (row >= rows.length) return name in edits.inserts[row - rows.length].values ? "changed" : "default";
      const key = keys[row];
      return key && edits.changes[key] && name in edits.changes[key] ? "changed" : null;
    },
  };
}
