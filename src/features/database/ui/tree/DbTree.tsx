import { CalendarClock, Database, Layers, Lock, Network, Pin, PinOff, Server, StickyNote, Table2 } from "lucide-react";
import type { KeyboardEvent, MouseEvent } from "react";
import { isCheckDue, localToday } from "@shared/database/dbPrep";
import { DB_ENGINE_LABELS, DB_ENVIRONMENT_LABELS, type DbConnection } from "@shared/database/types";
import { dbApi, dbAt, dbOne } from "@/features/database/ui/api";
import { isTreeKeyOpen, treeKey, withTreeKeyOpen } from "./treeKeys";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { cx } from "@/foundation/ui/lib/cx";
import { Chevron } from "@/foundation/ui/kit/Chevron";
import { TreeView } from "@/foundation/ui/kit/list/TreeView";
import { useTree } from "@/foundation/ui/kit/list/useTree";
import { useDbConnectedIds } from "@/features/database/ui/state/connectionsStore";
import { storage } from "@/features/database/ui/storage";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { StatusDot } from "@/foundation/ui/kit/StatusDot";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { useDbClient } from "@/features/database/ui/state/dbClientContext";
import { connectionScope } from "@/features/database/ui/dbFormat";
import { EngineMark } from "@/features/database/ui/connection/EngineMark";
import { isPinned, togglePin, type DbPin } from "@/features/database/ui/dbPins";
import { objectNodes } from "./DbTreeObjects";
import { pinNodes } from "./DbTreePins";
import { loadedNodes, TreeError, type DbTreeBuild, type DbTreeNode, type TreeMenuTarget } from "./DbTreeRow";
import { useTreeLoads } from "./useTreeLoads";

/**
 * 左の木（土台の TreeView の上）: 接続 → DB → スキーマ（PostgreSQL だけ）→ テーブル / ビュー / 関数 / 列挙型 → 列など（DbTreeObjects）。
 * 開いた段だけ読む（useTreeLoads）。名前を押すとタブを開く。接続の右クリックは onConnectionMenu
 */
export function DbTree({ connections, onConnectionMenu }: { connections: DbConnection[]; onConnectionMenu: (e: MouseEvent, connection: DbConnection) => void }) {
  const client = useDbClient();
  const [openList, setOpenList] = useSetting(storage.settings.treeOpen(client.surfaceKey));
  const isOpen = (key: string) => isTreeKeyOpen(openList, key);
  const setOpen = (key: string, open: boolean) => setOpenList([...withTreeKeyOpen(openList, key, open)]);
  const menu = useContextMenu<TreeMenuTarget>();
  const target = menu.menu?.value;
  const connected = useDbConnectedIds(client.projectId).data;
  const [pins, setPins] = useSetting(storage.settings.pins(String(client.projectId)));
  const roots = useTreeLoads((get) => {
    const b: DbTreeBuild = { get, client, isOpen, menu: menu.open };
    return connections.map((c) => connectionNode(b, c, connected?.includes(c.id) ?? false, pins, (e) => onConnectionMenu(e, c)));
  });
  // 押す・Space: 開閉する段は開閉、葉はタブを開く。テーブル・ビューは名前でタブを開き、矢印で開閉する
  const activate = (key: string, e: KeyboardEvent | MouseEvent) => {
    const node = findNode(roots, key);
    if (!node || !("label" in node.row)) return;
    const row = node.row;
    const onChevron = e.target instanceof Element && e.target.closest(".db-tree-chevron") !== null;
    if (row.openOnClick && !onChevron) row.onOpen?.();
    else if (node.children !== undefined) setOpen(key, !isOpen(key));
    else row.onOpen?.();
  };
  const tree = useTree<string, DbTreeNode>({ roots, open: { isOpen, set: setOpen }, onActivate: activate, label: "DB の接続" });
  const pin: DbPin | null = target?.table && (target.table.kind === "table" || target.table.kind === "view") ? { connection_id: target.connection.id, path: target.path, name: target.table.name, kind: target.table.kind } : null;
  const pinned = pin !== null && isPinned(pins, pin);
  return (
    <>
      <TreeView<string, DbTreeNode>
        tree={tree}
        className="db-tree"
        rowProps={({ node: { row } }) => {
          if ("hint" in row) return { className: "db-tree-hint" };
          if ("error" in row) return { className: "db-tree-error" };
          return { className: cx("db-tree-row", row.className), title: row.title, onDoubleClick: row.onPin, onContextMenu: row.onMenu };
        }}
        renderRow={({ node: { row }, hasChildren, open }) => {
          if ("hint" in row) return row.hint;
          if ("error" in row) return <TreeError error={row.error} connection={row.connection} onRetry={row.retry} />;
          return (
            <>
              <span className="db-tree-chevron">{hasChildren && <Chevron open={open} size={12} />}</span>
              {row.icon}
              <span className="db-tree-label">{row.label}</span>
              {row.mark}
              {row.note && <span className="db-tree-note">{row.note}</span>}
            </>
          );
        }}
      />
      {menu.menu && target && (
        <PopupMenu at={menu.menu.at} label={target.table ? "テーブルのメニュー" : "DB のメニュー"} onClose={menu.close}>
          {target.table && (
            <MenuItem onSelect={() => client.openTable(target.connection, target.path, target.table!.name, target.table!.kind)}>
              <Table2 size={14} /> 開く
            </MenuItem>
          )}
          {pin && (
            <MenuItem onSelect={() => setPins(togglePin(pins, pin))}>
              {pinned ? <PinOff size={14} /> : <Pin size={14} />} {pinned ? "ピン留めを外す" : "ピン留めする"}
            </MenuItem>
          )}
          <MenuItem onSelect={() => client.openEr(target.connection, target.path, target.table?.name ?? null)}>
            <Network size={14} /> {target.table ? "この表のまわりの ER 図" : "ER 図"}
          </MenuItem>
        </PopupMenu>
      )}
    </>
  );
}

/** 組んだ木から段を探す（開いている段の中だけ） */
function findNode(nodes: readonly DbTreeNode[], key: string): DbTreeNode | undefined {
  for (const node of nodes) {
    if (node.key === key) return node;
    const found = Array.isArray(node.children) ? findNode(node.children, key) : undefined;
    if (found) return found;
  }
  return undefined;
}

function connectionNode(b: DbTreeBuild, c: DbConnection, connected: boolean, pins: readonly DbPin[], onMenu: (e: MouseEvent) => void): DbTreeNode {
  const key = treeKey.connection(c.id);
  const worktree = b.client.worktreeOf(c.id);
  const children = (): DbTreeNode[] => {
    const dbs = b.get(JSON.stringify(["databases", c.id, c.updated_at, worktree]), () => dbApi("GET /api/projects/:projectId/db-connections/:connectionId/databases", dbAt(b.client.projectId, c.id, worktree)));
    return [
      ...pinNodes(b, c, pins),
      ...loadedNodes(key, dbs, c, (d) =>
        // DB が 1 つだけ（SQLite の main など）なら段を飛ばしてテーブルを出す
        d.databases.length === 1 && !d.has_schemas ? objectNodes(b, c, `${key}:objects`, { database: d.databases[0], schema: null }) : databaseNodes(b, c, d.databases, d.current, d.has_schemas),
      ),
    ];
  };
  return {
    key,
    row: {
      // 左の色の線が環境、頭の短い印が DB の種類（Pg / My / Lt。商標のロゴは使わない）
      className: cx("db-tree-connection", `db-env-${c.environment}`),
      icon: <EngineMark engine={c.engine} read="name" />,
      label: c.name,
      mark: (
        <>
          {c.read_only && (
            <span className="db-tree-lock" data-tip="読み取り専用（書く文は流しません）" aria-label="読み取り専用">
              <Lock size={11} aria-hidden />
            </span>
          )}
          {connected && (
            <span className="db-tree-connected" data-tip="つないでいます（右クリックの「接続を切る」で切れます）" aria-label="つないでいます">
              <StatusDot tone="ok" />
            </span>
          )}
          {c.note_path && (
            <span className="db-tree-note" data-tip={`手順ノート: ${c.note_path}`} aria-label="手順ノートあり">
              <StickyNote size={11} aria-hidden />
            </span>
          )}
          {isCheckDue(c.check_on, localToday()) && (
            <span className="db-tree-check" data-tip={`確かめる日（${c.check_on}）が来ました${c.check_note ? `: ${c.check_note}` : ""}`} aria-label="確かめる日が来ました">
              <CalendarClock size={11} aria-hidden />
            </span>
          )}
        </>
      ),
      note: DB_ENVIRONMENT_LABELS[c.environment],
      title: `${c.name}（${DB_ENGINE_LABELS[c.engine]} · ${DB_ENVIRONMENT_LABELS[c.environment]}${c.read_only ? " · 読み取り専用" : ""}）\n${connectionScope(c)}`,
      onMenu,
    },
    children: b.isOpen(key) ? children() : "lazy",
  };
}

/**
 * 接続の下の DB の並び。PostgreSQL（スキーマを持つ）は、つないでいる DB を上に出し、サーバーの中の別の DB は閉じた段「ほかの DB n」にまとめる
 * （開くと別に接続する）。MySQL / MariaDB は DB = スキーマなのでそのまま並べる
 */
function databaseNodes(b: DbTreeBuild, c: DbConnection, databases: string[], current: string | null, hasSchemas: boolean): DbTreeNode[] {
  if (!hasSchemas || !current || !databases.includes(current)) return databases.map((d) => databaseNode(b, c, d, d === current, hasSchemas));
  const others = databases.filter((d) => d !== current);
  const key = treeKey.others(c.id);
  const othersNode: DbTreeNode = {
    key,
    row: { icon: <Server size={13} aria-hidden />, label: "ほかの DB", note: String(others.length), title: "同じサーバーの別の DB（開くと別に接続する）" },
    children: b.isOpen(key) ? others.map((d) => databaseNode(b, c, d, false, hasSchemas)) : "lazy",
  };
  return [databaseNode(b, c, current, true, hasSchemas), ...(others.length > 0 ? [othersNode] : [])];
}

function databaseNode(b: DbTreeBuild, c: DbConnection, database: string, current: boolean, hasSchemas: boolean): DbTreeNode {
  const key = treeKey.database(c.id, database);
  const worktree = b.client.worktreeOf(c.id);
  const children = (): DbTreeNode[] => {
    if (!hasSchemas) return objectNodes(b, c, key, { database, schema: null });
    const schemas = b.get(JSON.stringify(["schemas", c.id, database, worktree]), () => dbApi("GET /api/projects/:projectId/db-connections/:connectionId/schemas", { ...dbOne(b.client.projectId, c.id), query: { database, worktree: worktree ?? undefined } }));
    return loadedNodes(key, schemas, c, (list) =>
      list.map((s) => {
        const sKey = treeKey.schema(c.id, database, s);
        const path = { database, schema: s };
        return { key: sKey, row: { icon: <Layers size={13} aria-hidden />, label: s, onMenu: (e) => b.menu(e, { connection: c, path, table: null }) }, children: b.isOpen(sKey) ? objectNodes(b, c, sKey, path) : "lazy" };
      }),
    );
  };
  return {
    key,
    row: {
      icon: <Database size={13} aria-hidden />,
      label: database,
      note: current ? "既定" : undefined,
      // PostgreSQL は DB の中のスキーマごとに描くので、DB の右クリックは public のスキーマ
      onMenu: (e) => b.menu(e, { connection: c, path: { database, schema: hasSchemas ? "public" : null }, table: null }),
    },
    children: b.isOpen(key) ? children() : "lazy",
  };
}
