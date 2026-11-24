import { Pin } from "lucide-react";
import type { DbConnection } from "@shared/database/types";
import { objectPathLabel } from "@/features/database/ui/dbFormat";
import { pinsOf, type DbPin } from "@/features/database/ui/dbPins";
import type { DbTreeBuild, DbTreeNode } from "./DbTreeRow";

/** 接続のすぐ下に並べる、ピン留めしたテーブル・ビュー（押すと仮のタブ・ダブルクリックで固定。右クリックはテーブルのメニュー） */
export function pinNodes(b: DbTreeBuild, c: DbConnection, all: readonly DbPin[]): DbTreeNode[] {
  const pins = pinsOf(all, c.id);
  // 場所（DB・スキーマ）は、ピンの場所が 2 つ以上あるときだけ添える（SQLite の main だけなどは出さない）
  const manyPlaces = new Set(pins.map((p) => objectPathLabel(p.path))).size > 1;
  return pins.map((p) => ({
    key: `pin:${c.id}:${encodeURIComponent(objectPathLabel(p.path))}:${p.kind}:${encodeURIComponent(p.name)}`,
    row: {
      icon: <Pin size={12} aria-hidden className="db-tree-pin" />,
      label: p.name,
      note: manyPlaces ? objectPathLabel(p.path) || undefined : undefined,
      title: `${objectPathLabel(p.path, p.name)}（ピン留め）`,
      className: "db-tree-object db-tree-pinned",
      onOpen: () => b.client.openTable(c, p.path, p.name, p.kind, undefined, true),
      onPin: () => b.client.openTable(c, p.path, p.name, p.kind),
      onMenu: (e) => b.menu(e, { connection: c, path: p.path, table: { name: p.name, kind: p.kind } }),
    },
  }));
}
