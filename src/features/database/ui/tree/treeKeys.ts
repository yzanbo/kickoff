// DB の木の段のキー（開き具合を置き場所ごとに覚える保存 treeOpen の値）。名前の部分は encodeURIComponent して「:」でつなぐので、
// DB・スキーマ・テーブルの名前に「:」があっても段を取り違えない（null の DB・スキーマは空）
import type { DbObjectKind, DbObjectPath } from "@shared/database/types";

const part = (name: string | null) => encodeURIComponent(name ?? "");
const unpart = (s: string) => (s === "" ? null : decodeURIComponent(s));

export const treeKey = {
  connection: (id: number) => `c:${id}`,
  /** PostgreSQL の「ほかの DB n」 */
  others: (id: number) => `o:${id}`,
  database: (id: number, database: string | null) => `d:${id}:${part(database)}`,
  schema: (id: number, database: string | null, schema: string) => `s:${id}:${part(database)}:${part(schema)}`,
  /** 種類ごとの段（初めは開いていて、閉じた段だけ覚える） */
  kindClosed: (id: number, path: DbObjectPath, kind: DbObjectKind) => `k:${id}:${part(path.database)}:${part(path.schema)}:${kind}:closed`,
  table: (id: number, path: DbObjectPath, name: string) => `t:${id}:${part(path.database)}:${part(path.schema)}:${part(name)}`,
  /** テーブルの中の段（列・索引・外部キー…） */
  tableGroup: (tableKey: string, group: string) => `${tableKey}:${group}`,
};

/** DB の段（d）・スキーマの段（s）のキーから、接続と場所を読む（ほかの段・壊れたものは null） */
export function parseTreeKey(key: string): { level: "database" | "schema"; connectionId: number; path: DbObjectPath } | null {
  const [kind, id, database, schema, ...rest] = key.split(":");
  if (rest.length > 0 || !/^\d+$/.test(id ?? "") || database === undefined) return null;
  if (kind === "d" && schema === undefined) return { level: "database", connectionId: Number(id), path: { database: unpart(database), schema: null } };
  if (kind === "s" && schema !== undefined) return { level: "schema", connectionId: Number(id), path: { database: unpart(database), schema: unpart(schema) } };
  return null;
}
