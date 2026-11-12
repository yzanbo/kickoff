import { Copy, FolderInput, PanelLeftClose, Plus, Search } from "lucide-react";
import type { DbConnection } from "@shared/types";
import { cx } from "@/lib/cx";
import type { useDragSize } from "@/hooks/useDragSize";
import { useDbConnectedIds } from "@/stores/dbConnections";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton } from "@/ui/IconButton";
import { DbTree } from "./DbTree";

/**
 * 左の一覧: 見出し（接続を足す・取り込む・写す・テーブルと列を探す・隠す）→ 接続の木 → 下の帯（つないでいる数・AI に見せる接続の数）。
 * 狭い所（narrow）では重ねて出し、幅のつまみは出さない
 */
export function DbList({
  projectId,
  connections,
  loaded,
  error,
  narrow,
  width,
  onAdd,
  onImport,
  onCopy,
  onFind,
  onHide,
  onConnectionMenu,
}: {
  projectId: number;
  connections: DbConnection[];
  loaded: boolean;
  error: string | undefined;
  narrow: boolean;
  width: ReturnType<typeof useDragSize<HTMLElement>>;
  onAdd: () => void;
  onImport: () => void;
  onCopy: () => void;
  onFind: () => void;
  onHide: () => void;
  onConnectionMenu: (e: React.MouseEvent, connection: DbConnection) => void;
}) {
  return (
    <aside ref={width.paneRef} className={cx("db-list", narrow && "overlay")} style={narrow ? undefined : { width: width.size }}>
      <div className="db-list-head">
        <span className="db-list-title">接続</span>
        <IconButton icon={Search} label="テーブル・列を探す（⌘⇧O）" onClick={onFind} disabled={connections.length === 0} />
        <IconButton icon={Plus} label="接続を追加" onClick={onAdd} />
        <IconButton icon={FolderInput} label="プロジェクトから取り込む（.env・docker compose・Prisma・SQLite のファイル）" onClick={onImport} />
        <IconButton icon={Copy} label="ほかのプロジェクトの接続を写す" onClick={onCopy} />
        <IconButton icon={PanelLeftClose} label="一覧を隠す" onClick={onHide} />
      </div>
      <ErrorText message={error} />
      {loaded && connections.length === 0 ? (
        <div className="db-list-empty small muted">
          <p>まだ接続がありません。</p>
          <button type="button" className="btn btn-sm" onClick={onAdd}>
            接続を追加
          </button>
          <button type="button" className="btn btn-sm" onClick={onImport}>
            プロジェクトから取り込む
          </button>
        </div>
      ) : (
        <DbTree connections={connections} onConnectionMenu={onConnectionMenu} />
      )}
      {connections.length > 0 && <ListFoot projectId={projectId} connections={connections} />}
      {!narrow && <div className="pane-resizer db-list-resizer" {...width.handle} />}
    </aside>
  );
}

/** 下の帯: 「n つ接続中 · AI に見せる: n」 */
function ListFoot({ projectId, connections }: { projectId: number; connections: DbConnection[] }) {
  const connected = useDbConnectedIds(projectId).data ?? [];
  const live = connections.filter((c) => connected.includes(c.id)).length;
  const shown = connections.filter((c) => c.ai_access !== "none");
  return (
    <div className="db-list-foot small muted">
      <span title="木・テーブル・SQL のタブでいまつないでいる接続の数">{live} つ接続中</span>
      <span aria-hidden>·</span>
      <span title={shown.length > 0 ? `チャットの AI に見せる接続: ${shown.map((c) => c.name).join("、")}` : "チャットの AI に見せる接続はありません"}>AI に見せる: {shown.length}</span>
    </div>
  );
}
