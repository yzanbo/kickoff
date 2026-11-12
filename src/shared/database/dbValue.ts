// セルの値（DbValue）の見分け（バイナリ・長い文字の頭）。どのプロセスからも使う純粋な関数
import type { DbBinary, DbLongText, DbValue } from "../types/database";

/** バイナリか */
export const isDbBinary = (v: DbValue): v is DbBinary => v !== null && typeof v === "object" && "binary" in v;

/** 頭だけの長い文字か */
export const isDbLongText = (v: DbValue): v is DbLongText => v !== null && typeof v === "object" && "long" in v;
