import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { NOW } from "./schema.js";
import type { BusEvent } from "@shared/types";

// db/ の各表の店で共通に使う小さな部品（店をまとめるのは store.ts）

/** SQL に渡す行（列名 → 値） */
export type Row = Record<string, SQLInputValue>;

/** 変更の知らせ（SSE で画面に配る） */
export type Notify = (e: BusEvent) => void;

/** 真偽値を DB の 0 / 1 にする（変える項目の undefined は「変えない」のまま） */
export function bit(value: boolean): 0 | 1;
export function bit(value: boolean | undefined): 0 | 1 | undefined;
export function bit(value: boolean | undefined) {
  return value === undefined ? undefined : value ? 1 : 0;
}

/**
 * patch のうち columns の列だけを UPDATE する（undefined の項目は変えない）。touch なら最後に動いた時刻（active_at。一覧の並び順）も進める。
 * 変える列がなければ何もしない
 */
export function updateRow(db: DatabaseSync, table: string, id: number, patch: Row, columns: readonly string[], touch = false) {
  const keys = Object.keys(patch).filter((k) => columns.includes(k) && patch[k] !== undefined);
  if (keys.length === 0 && !touch) return;
  const sets = [...keys.map((k) => `${k} = $${k}`), ...(touch ? [`active_at = ${NOW}`] : [])].join(", ");
  const params: Row = { id };
  for (const k of keys) params[k] = patch[k];
  db.prepare(`UPDATE ${table} SET ${sets} WHERE id = $id`).run(params);
}
