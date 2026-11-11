import { Database, Layers, Lock } from "lucide-react";
import { DB_ENGINE_LABELS, DB_ENVIRONMENT_LABELS, type DbConnection } from "@shared/types";
import { api } from "@/api";
import { useSetting } from "@/hooks/useSetting";
import { cx } from "@/lib/cx";
import { dbTreeOpen } from "@/lib/storageKeys";
import { useDbClient } from "./dbClientContext";
import { connectionPlace } from "./dbFormat";
import { ObjectsNode } from "./DbTreeObjects";
import { TreeError, TreeHint, TreeRow, useNodeLoad, type TreeOpen } from "./DbTreeRow";

/**
 * 左の木: 接続 → DB → スキーマ（PostgreSQL だけ）→ テーブル / ビュー / 関数 / 列挙型 → 列・インデックス・外部キー・トリガー（DbTreeObjects）。
 * 開いた段だけ読む（開いている段は置き場所ごとに覚える）。名前を押すとタブを開く。接続の右クリックは onConnectionMenu
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

interface NodeProps extends TreeOpen {
  connection: DbConnection;
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
          <ObjectsNode connection={c} depth={1} path={{ database: dbs.value.databases[0], schema: null }} tree={{ isOpen, toggle }} />
        ) : (
          dbs.value.databases.map((d) => <DatabaseNode key={d} connection={c} database={d} current={d === dbs.value?.current} hasSchemas={dbs.value!.has_schemas} isOpen={isOpen} toggle={toggle} />)
        ))}
    </>
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
      {open && !hasSchemas && <ObjectsNode connection={c} depth={2} path={{ database, schema: null }} tree={{ isOpen, toggle }} />}
      {open && schemas.loading && <TreeHint depth={2}>読み込み中…</TreeHint>}
      {open && schemas.error && <TreeError depth={2} error={schemas.error} connection={c} />}
      {open &&
        schemas.value?.map((s) => {
          const sKey = `s:${c.id}:${database}:${s}`;
          const sOpen = isOpen(sKey);
          return (
            <div key={s}>
              <TreeRow depth={2} open={sOpen} icon={<Layers size={13} aria-hidden />} label={s} onToggle={() => toggle(sKey)} />
              {sOpen && <ObjectsNode connection={c} depth={3} path={{ database, schema: s }} tree={{ isOpen, toggle }} />}
            </div>
          );
        })}
    </>
  );
}
