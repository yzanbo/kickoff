import { SquarePen, Trash2 } from "lucide-react";
import type { Placement } from "@/lib/floating";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { startDraftDrag } from "@/features/group/groups";
import { discardDraft, openDraft, useAllDrafts, type SidebarDraft } from "@/features/panel/state/panelMemory";
import { NEW_CHAT_TITLE } from "@/features/chat/chatTitle";

/** プロジェクトの下書き（すべてのボード・チャット欄の分。どのグループに置くかは bucketChats で分ける） */
export function useProjectDrafts(projectId: number): SidebarDraft[] {
  return useAllDrafts().filter((d) => d.projectId === projectId);
}

/**
 * サイドバーのプロジェクトの、送る前の新しいチャット（ボードの右のパネル・プロジェクトのチャット欄で書いている途中）。
 * ボードの「下書き」の列と同じもの。押すとそのパネルで開き（別の画面のものは、その画面へ移ってから）、右クリックで開く・削除。
 * ドラッグしてグループ（・グループなし）へ落とすと、作成先のグループを変える（送ったときにそのグループに入る）
 */
export function DraftRows({ drafts, drop }: { drafts: SidebarDraft[]; drop?: Record<string, unknown> }) {
  if (drafts.length === 0) return null;
  return (
    <ul className="chat-rows draft-rows" {...drop}>
      {drafts.map((d) => (
        <DraftRow key={`${d.memoryKey}:${d.key}`} draft={d} />
      ))}
    </ul>
  );
}

function DraftRow({ draft }: { draft: SidebarDraft }) {
  const menu = useContextMenu();
  const first = draft.text.trim().split("\n")[0] ?? "";
  return (
    <li className="chat-row-item">
      <button
        type="button"
        className="chat-row draft-row"
        title="下書き（ドラッグでグループへ移す・右クリックで削除）"
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
      {menu.menu && <DraftMenu at={menu.menu.at} onOpen={() => openDraft(draft)} onDelete={() => discardDraft(draft)} onClose={menu.close} />}
    </li>
  );
}

function DraftMenu({ at, onOpen, onDelete, onClose }: { at: Placement; onOpen: () => void; onDelete: () => void; onClose: () => void }) {
  return (
    <PopupMenu at={at} label="下書きの操作" onClose={onClose}>
      <MenuItem onSelect={onOpen}>
        <SquarePen size={14} /> 開く
      </MenuItem>
      <MenuItem danger onSelect={onDelete}>
        <Trash2 size={14} /> 削除
      </MenuItem>
    </PopupMenu>
  );
}
