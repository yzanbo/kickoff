// ルートの入力の読み取り（本文の JSON・クエリ・URL の番号）。形の確かめは zod（共通の形は routes/schemas.ts）
import type { Context } from "hono";
import { Invalid } from "./errors.js";

/**
 * 本文（JSON）を読む（形は呼ぶ側が zod で確かめる）。空の本文は {}（省ける項目だけのルートは本文なしで呼べ、必須の項目があれば検証で 400）。
 * JSON として読めなければ 400（読み取りの例外をそのまま 500 にしない）。本文はここ以外で読まない
 */
export async function jsonBody(c: Context): Promise<unknown> {
  const text = await c.req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Invalid("本文が JSON として読めません");
  }
}

/** URL の ?name= の値（なければ・空なら指定なし） */
export const queryOf = (c: Context, name: string): string | undefined => c.req.query(name) || undefined;

/** URL の :id などの番号（正の整数でなければ 400。NaN や小数を DB に渡さない。クエリの ID と同じ扱い） */
export function idParam(c: Context, name = "id"): number {
  const raw = c.req.param(name) ?? "";
  const id = Number(raw);
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(id)) throw new Invalid("ID の指定が正しくありません");
  return id;
}
