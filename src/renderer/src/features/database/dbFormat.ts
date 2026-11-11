// DB クライアントの表示の補助（セルの文・接続の行の説明・列の並べ替えの切り替え）。React に依らない
import type { DbConnection, DbObjectPath, DbSort, DbValue } from "@shared/types";
import { formatBytes } from "@/lib/format";

/** セルに出す文（NULL・バイナリの札・真偽値） */
export function cellText(value: DbValue): string {
  if (value === null) return "NULL";
  if (typeof value === "object") return `バイナリ ${formatBytes(value.bytes)}`;
  return String(value);
}

/** セルの値の種類（見た目のクラスに使う。NULL・バイナリは薄く、数は右寄せ） */
export function cellKind(value: DbValue): "null" | "binary" | "number" | "text" {
  if (value === null) return "null";
  if (typeof value === "object") return "binary";
  if (typeof value === "number") return "number";
  return "text";
}

/** 接続の行に添える場所（SQLite はファイル、ほかは ユーザー@ホスト:ポート/DB） */
export function connectionPlace(c: Pick<DbConnection, "engine" | "host" | "port" | "database" | "username" | "file_path">): string {
  if (c.engine === "sqlite") return c.file_path ?? "";
  const host = c.host ? `${c.host}${c.port ? `:${c.port}` : ""}` : "";
  return `${c.username ? `${c.username}@` : ""}${host}${c.database ? `/${c.database}` : ""}`;
}

/** 列の見出しを押したときの並べ替え（その列で 昇順 → 降順 → 並べ替えなし。ほかの列を押したらその列の昇順だけ） */
export function nextSort(sort: DbSort[], column: string): DbSort[] {
  const current = sort.find((s) => s.column === column);
  if (!current || sort.length > 1) return [{ column, desc: false }];
  return current.desc ? [] : [{ column, desc: true }];
}

/** テーブルなどの場所を 1 行の名前に（パンくず・タブの説明。DB とスキーマのうち、あるものを「.」でつなぐ） */
export function objectPathLabel(path: DbObjectPath, name?: string): string {
  return [path.database, path.schema, name].filter((v): v is string => Boolean(v)).join(".");
}
