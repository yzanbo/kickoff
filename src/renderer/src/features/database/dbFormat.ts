// DB クライアントの表示の補助（セルの文・接続の行の説明・列の並べ替えの切り替え）。React に依らない
import type { DbConnection, DbEngine, DbObjectPath, DbSort, DbValue } from "@shared/types";
import { isDbBinary, isDbLongText } from "@shared/database/dbValue";
import { formatBytes } from "@/lib/format";

/** セルに出す文（NULL・バイナリの札・真偽値・長い文字は頭と「…」） */
export function cellText(value: DbValue): string {
  if (value === null) return "NULL";
  if (isDbBinary(value)) return `バイナリ ${formatBytes(value.bytes)}`;
  if (isDbLongText(value)) return `${value.head}…`;
  return String(value);
}

/** セルの値の種類（見た目のクラスに使う。NULL・バイナリは薄く、数は右寄せ） */
export function cellKind(value: DbValue): "null" | "binary" | "number" | "text" {
  if (value === null) return "null";
  if (isDbBinary(value)) return "binary";
  if (typeof value === "number") return "number";
  return "text";
}

/** 接続の行に添える場所（SQLite はファイル、ほかは ユーザー@ホスト:ポート/DB） */
/** DB の種類の短い印（木・接続のホーム。商標のロゴは使わない） */
export const ENGINE_MARKS: Record<DbEngine, string> = { postgres: "Pg", mysql: "My", sqlite: "Lt" };

export function connectionPlace(c: Pick<DbConnection, "engine" | "host" | "port" | "database" | "username" | "file_path">): string {
  if (c.engine === "sqlite") return c.file_path ?? "";
  const host = c.host ? `${c.host}${c.port ? `:${c.port}` : ""}` : "";
  return `${c.username ? `${c.username}@` : ""}${host}${c.database ? `/${c.database}` : ""}`;
}

/**
 * 列の見出しを押したときの並べ替え（その列で 昇順 → 降順 → 並べ替えなし。ほかの列を押したらその列の昇順だけ）。
 * add（⇧ を押しながら）なら今の並べ替えに足す: 入っていない列は後ろに昇順で足し、入っている列は 昇順 → 降順 → 外す（ほかの列は残す）
 */
export function nextSort(sort: DbSort[], column: string, add = false): DbSort[] {
  const current = sort.find((s) => s.column === column);
  if (add) {
    if (!current) return [...sort, { column, desc: false }];
    return current.desc ? sort.filter((s) => s.column !== column) : sort.map((s) => (s.column === column ? { column, desc: true } : s));
  }
  if (!current || sort.length > 1) return [{ column, desc: false }];
  return current.desc ? [] : [{ column, desc: true }];
}

/** テーブルなどの場所を 1 行の名前に（パンくず・タブの説明。DB とスキーマのうち、あるものを「.」でつなぐ） */
export function objectPathLabel(path: DbObjectPath, name?: string): string {
  return [path.database, path.schema, name].filter((v): v is string => Boolean(v)).join(".");
}

const COMPACT = new Intl.NumberFormat("ja-JP", { notation: "compact", maximumFractionDigits: 1 });

/** 木に薄く添える、テーブルのおおよその行数（「1.2万行」の形。統計がなければ null） */
export function estimatedRowsLabel(rows: number | null | undefined): string | null {
  if (rows === null || rows === undefined || !Number.isFinite(rows) || rows < 0) return null;
  return `${COMPACT.format(rows)}行`;
}
