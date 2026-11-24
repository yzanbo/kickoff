import { ArrowDownAZ, Columns3, Eye, KeyRound, Link, ListOrdered, SquareFunction, Table2, Zap, type LucideIcon } from "lucide-react";
import { DB_OBJECT_KIND_LABELS, DB_OBJECT_KINDS, type DbConnection, type DbObject, type DbObjectKind, type DbObjectPath, type DbTableDetail } from "@shared/database/types";
import { treeKey as treeKeys } from "./treeKeys";
import { dbApi, dbAt } from "@/features/database/ui/api";
import { estimatedRowsLabel } from "@/features/database/ui/dbFormat";
import { hintNode, loadedNodes, type DbTreeBuild, type DbTreeNode } from "./DbTreeRow";

const OBJECT_ICONS: Record<DbObjectKind, LucideIcon> = { table: Table2, view: Eye, function: SquareFunction, enum: ListOrdered };

/** テーブル・ビュー・関数・列挙型のアイコン（木とタブで同じもの） */
export function TabObjectIcon({ object }: { object: DbObjectKind }) {
  const Icon = OBJECT_ICONS[object];
  return <Icon size={12} aria-hidden />;
}

/**
 * テーブル・ビュー・関数・列挙型の一覧（種類ごとの段に数を添えて分ける）。名前を押すとタブを開く。
 * テーブル・ビューは矢印（→ / ←）で中の段（列・インデックス・外部キー・トリガー）を開く
 */
export function objectNodes(b: DbTreeBuild, c: DbConnection, parent: string, path: DbObjectPath): DbTreeNode[] {
  const worktree = b.client.worktreeOf(c.id);
  const objects = b.get(JSON.stringify(["objects", c.id, path.database, path.schema, worktree]), () => dbApi("POST /api/projects/:projectId/db-connections/:connectionId/objects", { ...dbAt(b.client.projectId, c.id, worktree), body: { path } }));
  return loadedNodes(parent, objects, c, (list) => {
    if (list.length === 0) return [hintNode(parent, "テーブルがありません")];
    // 種類ごとの段（テーブル 12・ビュー 3 …）に分ける。中身のない種類は出さない。初めは開いておく（閉じた段だけ覚える）
    return DB_OBJECT_KINDS.flatMap((kind) => {
      const items = list.filter((o) => o.kind === kind);
      if (items.length === 0) return [];
      const key = treeKeys.kindClosed(c.id, path, kind);
      const Icon = OBJECT_ICONS[kind];
      const row = { icon: <Icon size={12} aria-hidden />, label: DB_OBJECT_KIND_LABELS[kind], note: items.length.toLocaleString(), className: "db-tree-group" };
      return [{ key, row, children: b.isOpen(key) ? items.map((o) => objectNode(b, c, path, o)) : "lazy" } satisfies DbTreeNode];
    });
  });
}

function objectNode(b: DbTreeBuild, c: DbConnection, path: DbObjectPath, o: DbObject): DbTreeNode {
  const Icon = OBJECT_ICONS[o.kind];
  const key = treeKeys.table(c.id, path, o.name);
  // 1 回押すと仮のタブ、ダブルクリックで固定
  const onOpen = () => b.client.openTable(c, path, o.name, o.kind, undefined, true);
  const onPin = () => b.client.openTable(c, path, o.name, o.kind);
  if (o.kind !== "table" && o.kind !== "view") return { key: `${key}:${o.kind}`, row: { icon: <Icon size={13} aria-hidden />, label: o.name, className: "db-tree-object", onOpen, onPin } };
  // おおよその行数（DB の統計）を薄く添える
  const rows = estimatedRowsLabel(o.estimated_rows);
  return {
    key,
    row: {
      icon: <Icon size={13} aria-hidden />,
      label: o.name,
      note: rows ?? undefined,
      title: rows ? `${o.name}（おおよそ ${o.estimated_rows!.toLocaleString()} 行。DB の統計から）` : undefined,
      className: "db-tree-object",
      openOnClick: true,
      onOpen,
      onPin,
      onMenu: (e) => b.menu(e, { connection: c, path, table: { name: o.name, kind: o.kind } }),
    },
    children: b.isOpen(key) ? tableNodes(b, c, path, o.name, key, onPin) : "lazy",
  };
}

/** テーブル・ビューの中の段: 列をそのまま並べ、インデックス・外部キー・トリガーは、あるときだけ開閉のまとまりに */
function tableNodes(b: DbTreeBuild, c: DbConnection, path: DbObjectPath, name: string, tableKey: string, onOpen: () => void): DbTreeNode[] {
  const worktree = b.client.worktreeOf(c.id);
  const detail = b.get(JSON.stringify(["table", c.id, path.database, path.schema, name, worktree]), () => dbApi("POST /api/projects/:projectId/db-connections/:connectionId/table", { ...dbAt(b.client.projectId, c.id, worktree), body: { path, name } }));
  return loadedNodes(tableKey, detail, c, (d) => [
    ...d.columns.map((col): DbTreeNode => ({
      key: `${tableKey}:col:${encodeURIComponent(col.name)}`,
      row: {
        icon: col.primary_key ? <KeyRound size={12} aria-hidden className="db-tree-pk" /> : <Columns3 size={12} aria-hidden />,
        label: col.name,
        note: `${col.type}${col.nullable ? "" : " · NOT NULL"}`,
        title: [`${col.name} ${col.type}`, col.primary_key ? "主キー" : null, col.default !== null ? `既定 ${col.default}` : null, col.comment].filter(Boolean).join("\n"),
        className: "db-tree-leaf",
        onOpen,
      },
    })),
    ...groupsOf(d).map((g): DbTreeNode => {
      const key = treeKeys.tableGroup(tableKey, g.id);
      return {
        key,
        row: { icon: <g.icon size={12} aria-hidden />, label: g.label, note: String(g.items.length), className: "db-tree-group" },
        children: b.isOpen(key)
          ? g.items.map((item) => ({ key: `${key}:${encodeURIComponent(item.label)}`, row: { icon: <g.icon size={12} aria-hidden />, label: item.label, note: item.note, title: item.title, className: "db-tree-leaf", onOpen } }))
          : "lazy",
      };
    }),
  ]);
}

interface TreeGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: { label: string; note: string; title: string }[];
}

/** インデックス・外部キー・トリガーのまとまり（ないものは出さない） */
function groupsOf(d: DbTableDetail): TreeGroup[] {
  const groups: TreeGroup[] = [
    {
      id: "idx",
      label: "インデックス",
      icon: ArrowDownAZ,
      items: d.indexes.map((i) => {
        const kind = i.primary ? "主キー" : i.unique ? "UNIQUE" : null;
        return { label: i.name, note: [i.columns.join(", "), kind].filter(Boolean).join(" · "), title: `${i.name}（${i.columns.join(", ")}）${kind ? ` ${kind}` : ""}` };
      }),
    },
    {
      id: "fk",
      label: "外部キー",
      icon: Link,
      items: d.foreign_keys.map((f, n) => {
        const target = `${f.ref_table}(${f.ref_columns.join(", ")})`;
        return { label: f.name ?? `外部キー ${n + 1}`, note: `${f.columns.join(", ")} → ${target}`, title: `${f.columns.join(", ")} → ${f.ref_schema ? `${f.ref_schema}.` : ""}${target}` };
      }),
    },
    {
      id: "trg",
      label: "トリガー",
      icon: Zap,
      items: d.triggers.map((t) => {
        const when = [t.timing, t.event].filter(Boolean).join(" ");
        return { label: t.name, note: when, title: when ? `${t.name}（${when}）` : t.name };
      }),
    },
  ];
  return groups.filter((g) => g.items.length > 0);
}
