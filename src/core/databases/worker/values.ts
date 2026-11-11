// DB から読んだ値を、JSON で送れるセルの値（DbValue）にする（どの種類のドライバでも同じ形にする）
import type { DbValue } from "@shared/types";

const HEAD_BYTES = 16;

const hex = (bytes: Uint8Array) => Array.from(bytes.subarray(0, HEAD_BYTES), (b) => b.toString(16).padStart(2, "0")).join("");

/** セルの値（大きな整数は文字列・日時は ISO・バイナリは大きさと頭・ほかのオブジェクトは JSON の文字列） */
export function toDbValue(value: unknown): DbValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
  if (value instanceof Uint8Array) return { binary: true, bytes: value.byteLength, head: hex(value) };
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? String(value) : value.toISOString();
  if (Array.isArray(value) || typeof value === "object") {
    try {
      return JSON.stringify(value, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v));
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** 識別子を "…" で囲む（中の " は 2 つにする。SQLite・PostgreSQL） */
export const quoteIdent = (name: string) => `"${name.replaceAll('"', '""')}"`;
