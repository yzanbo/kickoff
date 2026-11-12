import { Database, Plus } from "lucide-react";
import { DB_ENGINE_LABELS, DB_ENVIRONMENT_LABELS } from "@shared/types";
import { cx } from "@/lib/cx";
import { useDbConnectedIds, useDbConnections } from "@/stores/dbConnections";
import { MenuItem } from "@/ui/PopupMenu";
import { StatusDot } from "@/ui/StatusDot";
import { requestDbClient } from "./dbClientRequests";
import { connectionPlace, ENGINE_MARKS } from "./dbFormat";

/**
 * 右の欄の ▾ の「DB ▸」の中身: DB クライアントを開く ｜ 接続ごとの行（環境の色・DB の種類の印・名前・つないでいる緑の点。押すとその接続を木で開いた DB クライアント）。
 * 接続がなければ「接続を足す」だけ（DB クライアントを開いて登録のダイアログ）。place は開く先の DB クライアントの置き場所
 */
export function DbMenuItems({ projectId, place, onOpen }: { projectId: number; place: string; onOpen: () => void }) {
  const connections = useDbConnections(projectId).data ?? [];
  const connected = useDbConnectedIds(projectId).data;
  if (connections.length === 0) {
    return (
      <MenuItem
        title="DB クライアントを開いて、接続を登録する"
        onSelect={() => {
          requestDbClient(place, { kind: "add" });
          onOpen();
        }}
      >
        <Plus size={14} /> 接続を足す
      </MenuItem>
    );
  }
  return (
    <>
      <MenuItem title="DB クライアントを開く（接続の一覧と、前に開いていたタブ）" onSelect={onOpen}>
        <Database size={14} /> DB クライアント
      </MenuItem>
      <div className="menu-separator" role="separator" />
      {connections.map((c) => (
        <MenuItem
          key={c.id}
          title={`${c.name}（${DB_ENVIRONMENT_LABELS[c.environment]} · ${connectionPlace(c)}）を左の木で開く`}
          onSelect={() => {
            requestDbClient(place, { kind: "focus", connectionId: c.id });
            onOpen();
          }}
        >
          <span className={cx("db-menu-connection", `db-env-${c.environment}`)}>
            <span className="db-env-dot" aria-hidden />
            <span className="db-engine-mark" aria-label={DB_ENGINE_LABELS[c.engine]}>
              {ENGINE_MARKS[c.engine]}
            </span>
            <span className="db-menu-connection-name">{c.name}</span>
            {connected?.includes(c.id) && (
              <span className="db-menu-connected" aria-label="つないでいます">
                <StatusDot tone="ok" />
              </span>
            )}
          </span>
        </MenuItem>
      ))}
    </>
  );
}
