import { Database, Eye, Layers, Lock, Table2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { DB_ENGINE_LABELS, DB_ENVIRONMENT_LABELS, DB_NOT_IN_WORKTREE, type DbConnection, type DbObjectPath } from "@shared/types";
import { api, ApiError } from "@/api";
import { useSetting } from "@/hooks/useSetting";
import { cx } from "@/lib/cx";
import { dbTreeOpen } from "@/lib/storageKeys";
import { Chevron } from "@/ui/Chevron";
import { useDbClient } from "./dbClientContext";
import { connectionPlace } from "./dbFormat";

/** 木の 1 行（開閉の矢印・アイコン・名前・添える文）。押すと開閉か、葉なら onOpen */
function TreeRow({
  depth,
  open,
  icon,
  label,
  note,
  title,
  className,
  onToggle,
  onOpen,
  onContextMenu,
}: {
  depth: number;
  /** 開閉できる段なら開いているか（葉は undefined） */
  open?: boolean;
  icon: ReactNode;
  label: string;
  note?: string;
  title?: string;
  className?: string;
  onToggle?: () => void;
  onOpen?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      className={cx("db-tree-row", className)}
      style={{ paddingLeft: 6 + depth * 14 }}
      aria-expanded={open}
      title={title}
      onClick={() => (onToggle ? onToggle() : onOpen?.())}
      onDoubleClick={onToggle && onOpen ? onOpen : undefined}
      onContextMenu={onContextMenu}
    >
      <span className="db-tree-chevron">{open !== undefined && <Chevron open={open} size={12} />}</span>
      {icon}
      <span className="db-tree-label">{label}</span>
      {note && <span className="db-tree-note">{note}</span>}
    </button>
  );
}

/** 読み込みの失敗の行（ワークツリーにファイルがなければ、本体のものを開くボタン） */
function TreeError({ depth, error, connection }: { depth: number; error: unknown; connection: DbConnection }) {
  const client = useDbClient();
  const missing = error instanceof ApiError && error.code === DB_NOT_IN_WORKTREE;
  return (
    <div className="db-tree-error" style={{ paddingLeft: 26 + depth * 14 }}>
      <span>{error instanceof Error ? error.message : String(error)}</span>
      {missing && (
        <button type="button" className="link-button small" onClick={() => client.useMain(connection.id)}>
          本体のものを開く
        </button>
      )}
    </div>
  );
}

/** 開いた段の中身を読む（開いている間だけ。失敗は例外のまま持ち、行に出す。ワークツリーにないときの印 code を残すため） */
function useNodeLoad<T>(open: boolean, load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ value?: T; error?: unknown; loading: boolean }>({ loading: open });
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    load().then(
      (value) => alive && setState({ value, loading: false }),
      (error: unknown) => alive && setState({ error, loading: false }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ...deps]);
  return state;
}

/**
 * 左の木: 接続 → DB → スキーマ（PostgreSQL だけ）→ テーブル / ビュー。開いた段だけ読む（開いている段は置き場所ごとに覚える）。
 * テーブル・ビューを押すとテーブルのタブを開く。接続の右クリックは onConnectionMenu
 */
export function DbTree({ connections, onConnectionMenu }: { connections: DbConnection[]; onConnectionMenu: (e: React.MouseEvent, connection: DbConnection) => void }) {
  const client = useDbClient();
  const [openList, setOpenList] = useSetting(dbTreeOpen(client.place));
  const isOpen = (key: string) => openList.includes(key);
  const toggle = (key: string) => setOpenList(isOpen(key) ? openList.filter((k) => k !== key) : [...openList, key]);
  return (
    <div className="db-tree" role="tree">
      {connections.map((c) => (
        <ConnectionNode key={c.id} connection={c} isOpen={isOpen} toggle={toggle} onMenu={(e) => onConnectionMenu(e, c)} />
      ))}
    </div>
  );
}

interface NodeProps {
  connection: DbConnection;
  isOpen: (key: string) => boolean;
  toggle: (key: string) => void;
}

function ConnectionNode({ connection: c, isOpen, toggle, onMenu }: NodeProps & { onMenu: (e: React.MouseEvent) => void }) {
  const client = useDbClient();
  const key = `c:${c.id}`;
  const open = isOpen(key);
  const worktree = client.worktreeOf(c.id);
  const dbs = useNodeLoad(open, () => api.dbDatabases(client.projectId, c.id, worktree), [c.id, c.updated_at, worktree]);
  return (
    <>
      <TreeRow
        depth={0}
        open={open}
        className={cx("db-tree-connection", `db-env-${c.environment}`)}
        icon={<span className="db-env-dot" aria-hidden />}
        label={c.name}
        note={c.read_only ? undefined : DB_ENVIRONMENT_LABELS[c.environment]}
        title={`${c.name}（${DB_ENGINE_LABELS[c.engine]} · ${DB_ENVIRONMENT_LABELS[c.environment]}${c.read_only ? " · 読み取り専用" : ""}）\n${connectionPlace(c)}`}
        onToggle={() => toggle(key)}
        onContextMenu={onMenu}
      />
      {open && c.read_only && (
        <div className="db-tree-badge" style={{ paddingLeft: 26 }}>
          <Lock size={11} aria-hidden /> 読み取り専用 · {DB_ENVIRONMENT_LABELS[c.environment]}
        </div>
      )}
      {open && dbs.loading && <TreeHint depth={1}>読み込み中…</TreeHint>}
      {open && dbs.error && <TreeError depth={1} error={dbs.error} connection={c} />}
      {open &&
        dbs.value &&
        // DB が 1 つだけ（SQLite の main など）なら段を飛ばしてテーブルを出す
        (dbs.value.databases.length === 1 && !dbs.value.has_schemas ? (
          <ObjectsNode connection={c} depth={1} path={{ database: dbs.value.databases[0], schema: null }} />
        ) : (
          dbs.value.databases.map((d) => <DatabaseNode key={d} connection={c} database={d} current={d === dbs.value?.current} hasSchemas={dbs.value!.has_schemas} isOpen={isOpen} toggle={toggle} />)
        ))}
    </>
  );
}

function TreeHint({ depth, children }: { depth: number; children: ReactNode }) {
  return (
    <div className="db-tree-hint" style={{ paddingLeft: 26 + depth * 14 }}>
      {children}
    </div>
  );
}

function DatabaseNode({ connection: c, database, current, hasSchemas, isOpen, toggle }: NodeProps & { database: string; current: boolean; hasSchemas: boolean }) {
  const client = useDbClient();
  const key = `d:${c.id}:${database}`;
  const open = isOpen(key);
  const worktree = client.worktreeOf(c.id);
  const schemas = useNodeLoad(open && hasSchemas, () => api.dbSchemas(client.projectId, c.id, database, worktree), [c.id, database, worktree]);
  return (
    <>
      <TreeRow depth={1} open={open} icon={<Database size={13} aria-hidden />} label={database} note={current ? "既定" : undefined} onToggle={() => toggle(key)} />
      {open && !hasSchemas && <ObjectsNode connection={c} depth={2} path={{ database, schema: null }} />}
      {open && schemas.loading && <TreeHint depth={2}>読み込み中…</TreeHint>}
      {open && schemas.error && <TreeError depth={2} error={schemas.error} connection={c} />}
      {open &&
        schemas.value?.map((s) => {
          const sKey = `s:${c.id}:${database}:${s}`;
          const sOpen = isOpen(sKey);
          return (
            <div key={s}>
              <TreeRow depth={2} open={sOpen} icon={<Layers size={13} aria-hidden />} label={s} onToggle={() => toggle(sKey)} />
              {sOpen && <ObjectsNode connection={c} depth={3} path={{ database, schema: s }} />}
            </div>
          );
        })}
    </>
  );
}

/** テーブルとビューの一覧（押すとテーブルのタブ。ダブルクリックでも同じ） */
function ObjectsNode({ connection: c, depth, path }: { connection: DbConnection; depth: number; path: DbObjectPath }) {
  const client = useDbClient();
  const worktree = client.worktreeOf(c.id);
  const objects = useNodeLoad(true, () => api.dbObjects(client.projectId, c.id, path, worktree), [c.id, path.database, path.schema, worktree]);
  if (objects.loading) return <TreeHint depth={depth}>読み込み中…</TreeHint>;
  if (objects.error) return <TreeError depth={depth} error={objects.error} connection={c} />;
  if (objects.value?.length === 0) return <TreeHint depth={depth}>テーブルがありません</TreeHint>;
  return (
    <>
      {objects.value?.map((o) => (
        <TreeRow
          key={`${o.kind}:${o.name}`}
          depth={depth}
          icon={o.kind === "view" ? <Eye size={13} aria-hidden /> : <Table2 size={13} aria-hidden />}
          label={o.name}
          className="db-tree-object"
          onOpen={() => client.openTable(c, path, o.name, o.kind)}
        />
      ))}
    </>
  );
}
