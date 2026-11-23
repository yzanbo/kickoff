// 左の木のピン留め（接続ごとに、よく見るテーブル・ビューを接続のすぐ下に並べる）。React に依らない
import type { DbObjectPath } from "@shared/database/types";

/** ピン留めしたテーブル・ビュー */
export interface DbPin {
  connection_id: number;
  path: DbObjectPath;
  name: string;
  kind: "table" | "view";
}

const nullableText = (x: unknown) => x === null || typeof x === "string";

function isPin(x: unknown): x is DbPin {
  if (typeof x !== "object" || x === null) return false;
  const p = x as Partial<DbPin>;
  return typeof p.connection_id === "number" && typeof p.name === "string" && (p.kind === "table" || p.kind === "view") && typeof p.path === "object" && p.path !== null && nullableText(p.path.database) && nullableText(p.path.schema);
}

/** 保存した値からピンの列に（配列でなければ読めない。壊れたピンは捨てる） */
export function parseDbPins(value: unknown): DbPin[] | undefined {
  return Array.isArray(value) ? value.filter(isPin) : undefined;
}

const samePin = (a: DbPin, b: DbPin) => a.connection_id === b.connection_id && a.path.database === b.path.database && a.path.schema === b.path.schema && a.kind === b.kind && a.name === b.name;

/** その接続のピン（留めた順） */
export function pinsOf(pins: readonly DbPin[], connectionId: number): DbPin[] {
  return pins.filter((p) => p.connection_id === connectionId);
}

export function isPinned(pins: readonly DbPin[], pin: DbPin): boolean {
  return pins.some((p) => samePin(p, pin));
}

/** 留める / 外す（留めるものは後ろに足す） */
export function togglePin(pins: readonly DbPin[], pin: DbPin): DbPin[] {
  return isPinned(pins, pin) ? pins.filter((p) => !samePin(p, pin)) : [...pins, pin];
}
