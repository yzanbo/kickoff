import { SquarePen, Trash2 } from "lucide-react";
import { useState } from "react";
import { clampToViewport, MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { startDraftDrag } from "@/features/group/groups";
import { discardDraft, openDraft, useAllDrafts, type SidebarDraft } from "@/features/panel/state/panelMemory";
import { NEW_CHAT_TITLE } from "@/features/chat/chatTitle";

/**
 * プロジェクトの下書きを、置く場所ごとに分ける（グループの中 / いちばん上）。
 * いちばん上には、グループなしと、作成先のグループがもうないものを並べる
 */
export function useProjectDrafts(projectId: number, groupIds: number[]) {
  const drafts = useAllDrafts().filter((d) => d.projectId === projectId);
  return {
    top: drafts.filter((d) => d.group === undefined || !groupIds.includes(d.group)),
    inGroup: (group: number) => drafts.filter((d) => d.group === group),
  };
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
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
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
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
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
      {menu && <DraftMenu {...menu} onOpen={() => openDraft(draft)} onDelete={() => discardDraft(draft)} onClose={() => setMenu(null)} />}
    </li>
  );
}

function DraftMenu({ x, y, onOpen, onDelete, onClose }: { x: number; y: number; onOpen: () => void; onDelete: () => void; onClose: () => void }) {
  const at = clampToViewport(x, y, 200, 100);
  return (
    <PopupMenu x={at.x} y={at.y} label="下書きの操作" onClose={onClose}>
      <MenuItem onSelect={onOpen}>
        <SquarePen size={14} /> 開く
      </MenuItem>
      <MenuItem danger onSelect={onDelete}>
        <Trash2 size={14} /> 削除
      </MenuItem>
    </PopupMenu>
  );
}
