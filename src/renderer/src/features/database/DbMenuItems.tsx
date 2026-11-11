import { Database, SquareTerminal } from "lucide-react";
import { DB_ENVIRONMENT_LABELS } from "@shared/types";
import { openNewSqlTab } from "@/lib/dbClientTabs";
import { readSetting, writeSetting } from "@/lib/storage";
import { dbClientTabs } from "@/lib/storageKeys";
import { useDbConnections } from "@/stores/dbConnections";
import { MenuItem } from "@/ui/PopupMenu";
import { connectionPlace } from "./dbFormat";

/**
 * 右の欄の ▾ の「DB ▸」の中身: DB クライアントを開く ｜ 接続ごとに、新しい SQL のタブを開いた DB クライアント。
 * place は開く先の DB クライアントの置き場所（開いているタブを覚えるキー）
 */
export function DbMenuItems({ projectId, place, onOpen }: { projectId: number; place: string; onOpen: () => void }) {
  const connections = useDbConnections(projectId).data ?? [];
  return (
    <>
      <MenuItem title="DB クライアントを開く（接続の一覧と、前に開いていたタブ）" onSelect={onOpen}>
        <Database size={14} /> DB クライアント
      </MenuItem>
      {connections.length > 0 && <div className="menu-separator" role="separator" />}
      {connections.map((c) => (
        <MenuItem
          key={c.id}
          title={`${c.name}（${DB_ENVIRONMENT_LABELS[c.environment]} · ${connectionPlace(c)}）の新しい SQL のタブを開く`}
          onSelect={() => {
            writeSetting(dbClientTabs(place), openNewSqlTab(readSetting(dbClientTabs(place)), c.id));
            onOpen();
          }}
        >
          <SquareTerminal size={14} /> {c.name}
        </MenuItem>
      ))}
    </>
  );
}
