import { Archive, ArchiveRestore, Mail, MailOpen, PanelRight, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import type { Run } from "../../../../core/types";
import { api } from "../../api";
import { errorMessage } from "../../errors";
import { confirmDeleteRun, toggleArchiveRun, togglePinRun } from "../../runActions";
import { clampToViewport, PopupMenu } from "../PopupMenu";

/** チャットの右クリックメニュー（カンバンのカード・グループのボード・サイドバー）: 開く・名前を変更・既読 / 未読・サイドバーの上に固定・アーカイブ・削除 */
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
  const at = clampToViewport(x, y, 220, 295);

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
      {/* 固定はサイドバーの、プロジェクトのいちばん上のまとまりに出す（アーカイブしたものは固定しない） */}
      {!run.archived_at && (
        <button role="menuitem" onClick={() => void act(() => togglePinRun(run))}>
          {run.pinned ? <PinOff size={14} /> : <Pin size={14} />} {run.pinned ? "固定をやめる" : "サイドバーの上に固定"}
        </button>
      )}
      <button
        role="menuitem"
        onClick={() => {
          // 確かめるダイアログを出す前にメニューを閉じる（削除と同じ）
          onClose();
          void act(() => toggleArchiveRun(run));
        }}
      >
        {run.archived_at ? (
          <>
            <ArchiveRestore size={14} /> アーカイブから戻す
          </>
        ) : (
          <>
            <Archive size={14} /> アーカイブ
          </>
        )}
      </button>
      <button
        role="menuitem"
        className="danger"
        onClick={() => {
          onClose();
          void act(() => confirmDeleteRun(run));
        }}
      >
        <Trash2 size={14} /> 削除…
      </button>
    </PopupMenu>
  );
}
