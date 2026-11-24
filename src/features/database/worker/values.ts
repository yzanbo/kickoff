// DB から読んだ値を、JSON で送れるセルの値（DbValue）にする（どの種類のドライバでも同じ形にする）。トリガーの定義の読み方も種類によらず 1 つ
import { dbImageType } from "@shared/database/dbValue";
import { DB_IMAGE_PREVIEW_BYTES, DB_VALUE_HEAD_CHARS, type DbValue } from "@shared/database/types";

const HEAD_BYTES = 16;

const hex = (bytes: Uint8Array) => Array.from(bytes.subarray(0, HEAD_BYTES), (b) => b.toString(16).padStart(2, "0")).join("");

/** 長い文字は頭だけにする（full なら全体のまま） */
const clip = (text: string, full: boolean): DbValue => (full || text.length <= DB_VALUE_HEAD_CHARS ? text : { long: true, head: text.slice(0, DB_VALUE_HEAD_CHARS), chars: text.length });

/**
 * セルの値（大きな整数は文字列・日時は ISO・バイナリは大きさと頭・ほかのオブジェクトは JSON の文字列）。
 * DB_VALUE_HEAD_CHARS を超える文字は頭だけ（full なら全体。テーブルの行の詳細で残りを取るとき）
 */
export function toDbValue(value: unknown, full = false): DbValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return clip(value, full);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
  if (value instanceof Uint8Array) {
    const head = hex(value);
    // 全体のまま読むとき（行の詳細）だけ、大きすぎない画像は data: の URL も付ける（縮小表示）
    const image = full && value.byteLength <= DB_IMAGE_PREVIEW_BYTES ? dbImageType(head) : null;
    return image ? { binary: true, bytes: value.byteLength, head, data_url: `data:${image};base64,${Buffer.from(value).toString("base64")}` } : { binary: true, bytes: value.byteLength, head };
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? String(value) : value.toISOString();
  if (Array.isArray(value) || typeof value === "object") {
    try {
      return clip(JSON.stringify(value, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v)), full);
    } catch {
      return clip(String(value), full);
    }
  }
  return clip(String(value), full);
}

/** トリガーの定義の文から、いつ（BEFORE など）と何で（INSERT など）を読む（いつを書かない SQLite の定義は、何でだけ） */
export function triggerHead(definition: string): { timing: string | null; event: string | null } {
  const head = /\b(BEFORE|AFTER|INSTEAD\s+OF)\s+(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.exec(definition);
  if (head) return { timing: head[1]!.toUpperCase().replace(/\s+/, " "), event: head[2]!.toUpperCase() };
  const event = /\b(INSERT|UPDATE|DELETE)\b/i.exec(definition);
  return { timing: null, event: event?.[1]?.toUpperCase() ?? null };
}
