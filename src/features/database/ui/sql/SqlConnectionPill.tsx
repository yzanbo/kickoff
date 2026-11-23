import { ChevronDown } from "lucide-react";
import { DB_ENVIRONMENT_LABELS, type DbConnection } from "@shared/database/types";
import { cx } from "@/foundation/ui/lib/cx";
import { useDbConnections } from "@/features/database/ui/state/connectionsStore";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { useDbClient } from "@/features/database/ui/state/dbClientContext";
import { EngineMark } from "@/features/database/ui/connection/EngineMark";

/** ピルに出す場所（DB の名前、SQLite はファイルの名前） */
const placeOf = (c: DbConnection) => c.database ?? c.file_path?.split("/").at(-1) ?? null;

/**
 * SQL のタブの道具の行の頭の「どの接続・DB で流すか」のピル（環境の色）。押すとこのプロジェクトの接続を選んで、このタブで流す接続を替える
 * （コミットしていなければ先に聞く。DbClientContext の switchSqlConnection）
 */
export function SqlConnectionPill({ connection: c, tabKey, disabled }: { connection: DbConnection; tabKey: string; disabled: boolean }) {
  const client = useDbClient();
  const list = useDbConnections(client.projectId).data ?? [];
  const menu = useContextMenu<null>();
  const place = placeOf(c);
  return (
    <>
      <button
        type="button"
        className={cx("db-sql-pill tag small", `db-env-${c.environment}`)}
        data-look="outline"
        disabled={disabled}
        onClick={(e) => menu.toggle(e, null)}
        data-tip={disabled ? "流し終わってから替えられます" : "このタブで流す接続を替える"}
      >
        <span className="db-env-dot" aria-hidden />
        <EngineMark engine={c.engine} />
        <span className="db-sql-pill-name">{c.name}</span>
        {place && <span className="db-sql-pill-place">· {place}</span>}
        <ChevronDown size={12} aria-hidden />
      </button>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="流す接続" onClose={menu.close} ignore=".db-sql-pill">
          {list.map((x) => (
            <MenuItem key={x.id} role="menuitemradio" checked={x.id === c.id} onSelect={() => x.id !== c.id && void client.switchSqlConnection(tabKey, x)}>
              <span className={cx("db-sql-pill-item", `db-env-${x.environment}`)}>
                <span className="db-env-dot" aria-hidden />
                {x.name}
                <span className="muted small">
                  {DB_ENVIRONMENT_LABELS[x.environment]}
                  {placeOf(x) ? ` · ${placeOf(x)}` : ""}
                </span>
              </span>
            </MenuItem>
          ))}
        </PopupMenu>
      )}
    </>
  );
}
