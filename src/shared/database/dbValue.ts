// セルの値（DbValue）の見分け（バイナリ・長い文字の頭）。どのプロセスからも使う純粋な関数
import type { DbBinary, DbLongText, DbValue } from "../types/database";

/** バイナリか */
export const isDbBinary = (v: DbValue): v is DbBinary => v !== null && typeof v === "object" && "binary" in v;

/** 頭だけの長い文字か */
export const isDbLongText = (v: DbValue): v is DbLongText => v !== null && typeof v === "object" && "long" in v;

/** バイナリの画像の種類（頭の 16 進から。PNG・JPEG・GIF・WebP だけ。SVG は中にスクリプトを書けるので扱わない）。画像でなければ null */
export function dbImageType(headHex: string): "image/png" | "image/jpeg" | "image/gif" | "image/webp" | null {
  const h = headHex.toLowerCase();
  if (h.startsWith("89504e470d0a1a0a")) return "image/png";
  if (h.startsWith("ffd8ff")) return "image/jpeg";
  if (h.startsWith("474946383761") || h.startsWith("474946383961")) return "image/gif";
  if (h.startsWith("52494646") && h.slice(16, 24) === "57454250") return "image/webp";
  return null;
}
