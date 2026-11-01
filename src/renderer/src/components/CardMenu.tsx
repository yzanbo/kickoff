import { Archive, ArchiveRestore, PanelRight, Pencil, Trash2 } from "lucide-react";
import type { Run } from "../../../core/types";
import { api } from "../api";
import { confirmDialog, promptDialog } from "../dialogs";
import { clampToViewport, PopupMenu } from "./PopupMenu";

/** チャットの右クリックメニュー（カンバンのカード・グループのボード・サイドバー）: 開く・名前を変更・アーカイブ・削除 */
export function CardMenu({
  x,
  y,
  run,
  onOpenPanel,
  onClose,
  onError,
}: {
  x: number;
  y: number;
  run: Run;
  onOpenPanel: (run: Run) => void;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      onClose();
    }
  };
  const at = clampToViewport(x, y, 220, 220);

  return (
    <PopupMenu x={at.x} y={at.y} escape="pass" onClose={onClose}>
      <button role="menuitem" onClick={() => (onOpenPanel(run), onClose())}>
        <PanelRight size={14} /> 開く
      </button>
      <button
        role="menuitem"
        onClick={async () => {
          onClose();
          const title = await promptDialog({ title: "チャットの名前を変更", initial: run.title, confirmLabel: "変更" });
          if (title && title !== run.title) void act(() => api.renameRun(run.id, title));
        }}
      >
        <Pencil size={14} /> 名前を変更
      </button>
      {run.archived_at ? (
        <button role="menuitem" onClick={() => void act(() => api.archiveRun(run.id, false))}>
          <ArchiveRestore size={14} /> アーカイブから戻す
        </button>
      ) : (
        <button role="menuitem" onClick={() => void act(() => api.archiveRun(run.id))}>
          <Archive size={14} /> アーカイブ
        </button>
      )}
      <button
        role="menuitem"
        className="danger"
        onClick={async () => {
          onClose();
          const ok = await confirmDialog({
            title: `チャット「${run.title || "無題のチャット"}」を削除しますか？`,
            message: "会話の記録も消えます。残しておきたいときはアーカイブを使ってください。",
            confirmLabel: "削除",
            danger: true,
          });
          if (ok) void act(() => api.deleteRun(run.id));
        }}
      >
        <Trash2 size={14} /> 削除…
      </button>
    </PopupMenu>
  );
}
