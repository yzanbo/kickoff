import { ArrowDownAZ, Columns3, Eye, KeyRound, Link, ListOrdered, SquareFunction, Table2, Zap, type LucideIcon } from "lucide-react";
import type { DbConnection, DbObject, DbObjectKind, DbObjectPath, DbTableDetail } from "@shared/types";
import { api } from "@/api";
import { useDbClient } from "./dbClientContext";
import { TreeError, TreeHint, TreeRow, useNodeLoad, type TreeOpen } from "./DbTreeRow";

const OBJECT_ICONS: Record<DbObjectKind, LucideIcon> = { table: Table2, view: Eye, function: SquareFunction, enum: ListOrdered };

/** テーブル・ビュー・関数・列挙型のアイコン（木とタブで同じもの） */
export function TabObjectIcon({ object }: { object: DbObjectKind }) {
  const Icon = OBJECT_ICONS[object];
  return <Icon size={12} aria-hidden />;
}

/**
 * テーブル・ビュー・関数・列挙型の一覧。名前を押すとタブを開く。
 * テーブル・ビューは矢印（→ / ←）で中の段（列・インデックス・外部キー・トリガー）を開く
 */
export function ObjectsNode({ connection: c, depth, path, tree }: { connection: DbConnection; depth: number; path: DbObjectPath; tree: TreeOpen }) {
  const client = useDbClient();
  const worktree = client.worktreeOf(c.id);
  const objects = useNodeLoad(true, () => api.dbObjects(client.projectId, c.id, path, worktree), [c.id, path.database, path.schema, worktree]);
  if (objects.loading) return <TreeHint depth={depth}>読み込み中…</TreeHint>;
  if (objects.error) return <TreeError depth={depth} error={objects.error} connection={c} />;
  if (objects.value?.length === 0) return <TreeHint depth={depth}>テーブルがありません</TreeHint>;
  return <>{objects.value?.map((o) => <ObjectNode key={`${o.kind}:${o.name}`} connection={c} depth={depth} path={path} object={o} tree={tree} />)}</>;
}

function ObjectNode({ connection: c, depth, path, object: o, tree }: { connection: DbConnection; depth: number; path: DbObjectPath; object: DbObject; tree: TreeOpen }) {
  const client = useDbClient();
  const Icon = OBJECT_ICONS[o.kind];
  const open = () => client.openTable(c, path, o.name, o.kind);
  if (o.kind !== "table" && o.kind !== "view") {
    return <TreeRow depth={depth} icon={<Icon size={13} aria-hidden />} label={o.name} className="db-tree-object" onOpen={open} />;
  }
  const key = `t:${c.id}:${path.database ?? ""}:${path.schema ?? ""}:${o.name}`;
  const isOpen = tree.isOpen(key);
  return (
    <>
      <TreeRow
        depth={depth}
        open={isOpen}
        openOnClick
        icon={<Icon size={13} aria-hidden />}
        label={o.name}
        className="db-tree-object"
        onToggle={() => tree.toggle(key)}
        onOpen={open}
        onContextMenu={(e) => tree.menu(e, { connection: c, path, table: { name: o.name, kind: o.kind } })}
      />
      {isOpen && <TableChildren connection={c} depth={depth + 1} path={path} name={o.name} treeKey={key} tree={tree} onOpen={open} />}
    </>
  );
}

/** テーブル・ビューの中の段: 列をそのまま並べ、インデックス・外部キー・トリガーは、あるときだけ開閉のまとまりに */
function TableChildren({
  connection: c,
  depth,
  path,
  name,
  treeKey,
  tree,
  onOpen,
}: {
  connection: DbConnection;
  depth: number;
  path: DbObjectPath;
  name: string;
  treeKey: string;
  tree: TreeOpen;
  onOpen: () => void;
}) {
  const client = useDbClient();
  const worktree = client.worktreeOf(c.id);
  const detail = useNodeLoad(true, () => api.dbTable(client.projectId, c.id, path, name, worktree), [c.id, path.database, path.schema, name, worktree]);
  if (detail.loading) return <TreeHint depth={depth}>読み込み中…</TreeHint>;
  if (detail.error) return <TreeError depth={depth} error={detail.error} connection={c} />;
  const d = detail.value;
  if (!d) return null;
  return (
    <>
      {d.columns.map((col) => (
        <TreeRow
          key={col.name}
          depth={depth}
          icon={col.primary_key ? <KeyRound size={12} aria-hidden className="db-tree-pk" /> : <Columns3 size={12} aria-hidden />}
          label={col.name}
          note={`${col.type}${col.nullable ? "" : " · NOT NULL"}`}
          title={[`${col.name} ${col.type}`, col.primary_key ? "主キー" : null, col.default !== null ? `既定 ${col.default}` : null, col.comment].filter(Boolean).join("\n")}
          className="db-tree-leaf"
          onOpen={onOpen}
        />
      ))}
      {groupsOf(d).map((g) => {
        const key = `${treeKey}:${g.id}`;
        const open = tree.isOpen(key);
        return (
          <div key={g.id}>
            <TreeRow depth={depth} open={open} icon={<g.icon size={12} aria-hidden />} label={g.label} note={String(g.items.length)} className="db-tree-group" onToggle={() => tree.toggle(key)} />
            {open &&
              g.items.map((item) => (
                <TreeRow key={item.label} depth={depth + 1} icon={<g.icon size={12} aria-hidden />} label={item.label} note={item.note} title={item.title} className="db-tree-leaf" onOpen={onOpen} />
              ))}
          </div>
        );
      })}
    </>
  );
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
