// 「テーブル・列を探す」（⌘⇧O）の候補の並べ方。React に依らない
import type { DbEngine, DbObject, DbObjectPath } from "@shared/types";

/** 探す元: 1 つの接続の 1 つの場所のテーブル・ビュー（objects）と、その列の名前（columns。テーブルの名前ごと） */
export interface DbFindSource {
  connection_id: number;
  path: DbObjectPath;
  objects: DbObject[];
  columns: ReadonlyMap<string, readonly string[]>;
}

export interface DbFindItem {
  key: string;
  connection_id: number;
  path: DbObjectPath;
  table: string;
  kind: "table" | "view";
  /** 列で当たったときの列の名前（テーブルで当たったら null） */
  column: string | null;
}

/** 当たり方の順（小さいほど上）: 同じ名前 → 頭が同じ → 中に含む。当たらなければ null */
function rank(name: string, q: string): number | null {
  const n = name.toLowerCase();
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  return n.includes(q) ? 2 : null;
}

/**
 * 探す文で候補を並べる。テーブル・ビューの名前で当たったものを先に、列の名前で当たったものを後に（どちらも当たり方の順、同じなら元の並び）。
 * 「表.列」の形なら、表の名前と列の名前の両方で絞る。空ならテーブル・ビューを元の並びで。limit まで
 */
export function findDbItems(sources: readonly DbFindSource[], query: string, limit = 100): DbFindItem[] {
  const q = query.trim().toLowerCase();
  const dot = q.indexOf(".");
  const tableQ = dot >= 0 ? q.slice(0, dot) : q;
  const columnQ = dot >= 0 ? q.slice(dot + 1) : null;
  const hits: { item: DbFindItem; score: number; order: number }[] = [];
  let order = 0;
  for (const s of sources) {
    const where = `${s.connection_id}:${s.path.database ?? ""}:${s.path.schema ?? ""}`;
    for (const o of s.objects) {
      if (o.kind !== "table" && o.kind !== "view") continue;
      const base = { connection_id: s.connection_id, path: s.path, table: o.name, kind: o.kind };
      const tableRank = tableQ ? rank(o.name, tableQ) : 0;
      if (columnQ === null) {
        if (tableRank !== null) hits.push({ item: { ...base, key: `${where}:${o.name}`, column: null }, score: tableRank, order: order++ });
        if (!q) continue;
        for (const col of s.columns.get(o.name) ?? []) {
          const r = rank(col, q);
          if (r !== null) hits.push({ item: { ...base, key: `${where}:${o.name}.${col}`, column: col }, score: 10 + r, order: order++ });
        }
      } else if (tableRank !== null) {
        for (const col of s.columns.get(o.name) ?? []) {
          const r = columnQ ? rank(col, columnQ) : 0;
          if (r !== null) hits.push({ item: { ...base, key: `${where}:${o.name}.${col}`, column: col }, score: tableRank * 3 + r, order: order++ });
        }
      }
    }
  }
  return hits
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .slice(0, limit)
    .map((h) => h.item);
}

/**
 * 左の木で開いている場所（接続ごとの DB・スキーマの段のキー。DbTree の `d:<接続>:<DB>` / `s:<接続>:<DB>:<スキーマ>`）。
 * PostgreSQL はスキーマの段、ほかは DB の段。名前に「:」があればスキーマの名前の方を短く読む
 */
export function openTreePaths(openKeys: readonly string[], connectionId: number, engine: DbEngine): DbObjectPath[] {
  const prefix = engine === "postgres" ? `s:${connectionId}:` : `d:${connectionId}:`;
  return openKeys
    .filter((k) => k.startsWith(prefix))
    .map((k) => {
      const rest = k.slice(prefix.length);
      if (engine !== "postgres") return { database: rest, schema: null };
      const at = rest.lastIndexOf(":");
      return { database: rest.slice(0, at), schema: rest.slice(at + 1) };
    });
}
