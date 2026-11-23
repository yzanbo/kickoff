// ER 図のテーブルの形（DB ワーカーが木と同じテーブルの詳細から作る。関係・図の決まりは画面の features/database/ui/er/erDiagram.ts）
import type { DbErTable, DbTableDetail } from "./types";

/** テーブルの詳細から ER 図の形を作る（ワーカーが木と同じ詳細から作る） */
export function erTableOf(name: string, detail: DbTableDetail): DbErTable {
  const pk = detail.columns.filter((c) => c.primary_key).map((c) => c.name);
  const uniques = detail.indexes.filter((i) => i.unique && !i.primary && i.columns.length > 0).map((i) => i.columns);
  return {
    name,
    kind: detail.kind,
    comment: detail.comment,
    columns: detail.columns.map((c) => ({ name: c.name, type: c.type, nullable: c.nullable, primary_key: c.primary_key })),
    foreign_keys: detail.foreign_keys,
    unique_sets: pk.length > 0 ? [pk, ...uniques] : uniques,
  };
}
