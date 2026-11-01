import { Archive, ArchiveRestore, Mail, MailOpen, PanelRight, Pencil, Trash2 } from "lucide-react";
import type { Run } from "../../../core/types";
import { api } from "../api";
import { chatTitle } from "../chatTitle";
import { confirmDialog } from "../dialogs";
import { errorMessage } from "../errors";
import { clampToViewport, PopupMenu } from "./PopupMenu";

/** チャットの右クリックメニュー（カンバンのカード・グループのボード・サイドバー）: 開く・名前を変更・アーカイブ・削除 */
export function CardMenu({
  x,
  y,
  run,
  onOpenPanel,
  onRename,
  onClose,
  onError,
}: {
  x: number;
  y: number;
  run: Run;
  onOpenPanel: (run: Run) => void;
  /** 名前をその場で変え始める（カード・行の名前を入力欄にする） */
  onRename: (run: Run) => void;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      onClose();
    } catch (e) {
      onError(errorMessage(e));
      onClose();
    }
  };
  const at = clampToViewport(x, y, 220, 260);

  return (
    <PopupMenu x={at.x} y={at.y} escape="pass" onClose={onClose}>
      <button role="menuitem" onClick={() => (onOpenPanel(run), onClose())}>
        <PanelRight size={14} /> 開く
      </button>
      <button role="menuitem" onClick={() => (onClose(), onRename(run))}>
        <Pencil size={14} /> 名前を変更
      </button>
      {/* 未読 = 確認待ちの印（サイドバーで太字になる。次に開くまで残る） */}
      {run.attention ? (
        <button role="menuitem" onClick={() => void act(() => api.markSeen(run.id))}>
          <MailOpen size={14} /> 既読にする
        </button>
      ) : (
        <button role="menuitem" onClick={() => void act(() => api.markUnseen(run.id))}>
          <Mail size={14} /> 未読にする
        </button>
      )}
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
            title: `チャット「${chatTitle(run.title)}」を削除しますか？`,
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
