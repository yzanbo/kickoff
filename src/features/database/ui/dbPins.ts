// 左の木のピン留め（接続ごとに、よく見るテーブル・ビューを接続のすぐ下に並べる）。React に依らない
import type { DbObjectPath } from "@shared/types";

/** ピン留めしたテーブル・ビュー */
export interface DbPin {
  connection_id: number;
  path: DbObjectPath;
  name: string;
  kind: "table" | "view";
}

/** 保存する形（1 つのピンを 1 つの文字に。接続・DB・スキーマ・種類・名前の JSON の配列） */
export function pinId(pin: DbPin): string {
  return JSON.stringify([pin.connection_id, pin.path.database, pin.path.schema, pin.kind, pin.name]);
}

/** 保存した文字からピンに（壊れたものは捨てる） */
export function parsePin(id: string): DbPin | null {
  try {
    const v: unknown = JSON.parse(id);
    if (!Array.isArray(v) || v.length !== 5) return null;
    const [cid, database, schema, kind, name] = v as unknown[];
    const nullableText = (x: unknown) => x === null || typeof x === "string";
    if (typeof cid !== "number" || !nullableText(database) || !nullableText(schema) || (kind !== "table" && kind !== "view") || typeof name !== "string") return null;
    return { connection_id: cid, path: { database: database as string | null, schema: schema as string | null }, name, kind };
  } catch {
    return null;
  }
}

/** その接続のピン（留めた順） */
export function pinsOf(ids: readonly string[], connectionId: number): DbPin[] {
  return ids.map(parsePin).filter((p): p is DbPin => p !== null && p.connection_id === connectionId);
}

export function isPinned(ids: readonly string[], pin: DbPin): boolean {
  return ids.includes(pinId(pin));
}

/** 留める / 外す（留めるものは後ろに足す） */
export function togglePin(ids: readonly string[], pin: DbPin): string[] {
  const id = pinId(pin);
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}
