import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { NOW } from "../schema.js";
import type { BusEvent } from "../types.js";

// store/ の各モジュールで共通に使う小さな部品（Store のファサードは src/core/store.ts）

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

/** 壊れた値は空（既定）に戻す */
export function parseJson<T extends object>(text: string | null | undefined): T {
  try {
    const value = JSON.parse(text || "{}");
    return value && typeof value === "object" ? value : ({} as T);
  } catch {
    return {} as T;
  }
}

/**
 * patch のうち allowed の列だけを UPDATE する。touch なら最後に動いた時刻（active_at。一覧の並び順）も進める。
 * 該当する列がなければ何もしない
 */
export function updateRow(db: DatabaseSync, table: string, id: number, patch: Row, allowed: readonly string[], touch: boolean) {
  const keys = Object.keys(patch).filter((k) => allowed.includes(k) && patch[k] !== undefined);
  if (keys.length === 0) return;
  const sets = [...keys.map((k) => `${k} = $${k}`), ...(touch ? [`active_at = ${NOW}`] : [])].join(", ");
  const params: Row = { id };
  for (const k of keys) params[k] = patch[k];
  db.prepare(`UPDATE ${table} SET ${sets} WHERE id = $id`).run(params);
}

/** チャットの作成時にプロジェクトの最後に動いた時刻を進める（一覧の並び順用） */
export function touchProject(db: DatabaseSync, id: number) {
  db.prepare(`UPDATE projects SET active_at = ${NOW} WHERE id = ?`).run(id);
}
