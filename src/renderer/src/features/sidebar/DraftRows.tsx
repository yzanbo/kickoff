import { Pin, SquarePen, Trash2 } from "lucide-react";
import { useMemo } from "react";
import type { Placement } from "@/lib/floating";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { startDraftDrag } from "@/features/group/groups";
import { discardDraft, openDraft, togglePinDraft, useAllDrafts, type PanelDraft } from "@/features/panel/state/panelDrafts";
import { NEW_CHAT_TITLE } from "@/features/chat/chatTitle";

/** プロジェクトの下書き（すべてのボード・チャット欄の分。どのグループに置くかは bucketChats で分ける。下書きが変わるまでは同じ配列） */
export function useProjectDrafts(projectId: number): PanelDraft[] {
  const all = useAllDrafts();
  return useMemo(() => all.filter((d) => d.projectId === projectId), [all, projectId]);
}

/**
 * サイドバーのプロジェクトの、送る前の新しいチャット（ボードの右のパネル・プロジェクトのチャット欄で書いている途中）。
 * ボードの「下書き」の列と同じもの。押すとそのパネルで開き（別の画面のものは、その画面へ移ってから）、右クリックで開く・ピン留め・削除（ピン留めしたものは「固定」に出す）。
 * ドラッグしてグループ（・グループなし）へ落とすと、作成先のグループを変える（送ったときにそのグループに入る。落とし先はまとまりを包む要素）
 */
export function DraftRows({ drafts }: { drafts: PanelDraft[] }) {
  if (drafts.length === 0) return null;
  return (
    <ul className="chat-rows draft-rows">
      {drafts.map((d) => (
        <DraftRow key={`${d.panel}:${d.key}`} draft={d} />
      ))}
    </ul>
  );
}

function DraftRow({ draft }: { draft: PanelDraft }) {
  const menu = useContextMenu();
  const first = draft.text.trim().split("\n")[0] ?? "";
  return (
    <li className="chat-row-item">
      <button
        type="button"
        className="chat-row draft-row"
        title="下書き（ドラッグでグループへ移す・右クリックでピン留め・削除）"
        draggable
        onDragStart={(e) => startDraftDrag(e, draft)}
        onClick={() => openDraft(draft)}
        onContextMenu={menu.open}
      >
        <span className="status-slot draft-slot" aria-hidden>
          <SquarePen size={12} />
        </span>
        <span className="chat-row-body">
          <span className="chat-row-line">
            <span className="chat-row-title">{first || NEW_CHAT_TITLE}</span>
            <span className="chat-row-time">下書き</span>
          </span>
        </span>
      </button>
      {menu.menu && (
        <DraftMenu at={menu.menu.at} pinned={draft.pinned} onOpen={() => openDraft(draft)} onPin={() => togglePinDraft(draft)} onDelete={() => discardDraft(draft)} onClose={menu.close} />
      )}
    </li>
  );
}

function DraftMenu({
  at,
  pinned,
  onOpen,
  onPin,
  onDelete,
  onClose,
}: {
  at: Placement;
  pinned: boolean;
  onOpen: () => void;
  onPin: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <PopupMenu at={at} label="下書きの操作" onClose={onClose}>
      <MenuItem onSelect={onOpen}>
        <SquarePen size={14} /> 開く
      </MenuItem>
      {/* チャットのメニューの「ピン留め」と同じ文とアイコン。固定したものはプロジェクトのいちばん上の「固定」に出す */}
      <MenuItem onSelect={onPin}>
        <Pin size={14} /> {pinned ? "ピン留めを外す" : "ピン留め"}
      </MenuItem>
      <MenuItem danger onSelect={onDelete}>
        <Trash2 size={14} /> 削除
      </MenuItem>
    </PopupMenu>
  );
}
