import { Pin, SquarePen, Trash2 } from "lucide-react";
import { useMemo } from "react";
import type { Placement } from "@/lib/floating";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { startDraftDrag } from "@/features/group/groups";
import { discardDraft, openDraft, togglePinDraft, useAllDrafts, type PanelDraft } from "@/features/panel/state/panelDrafts";
import { NEW_CHAT_TITLE } from "@/features/chat/chatTitle";
import { useRoute } from "@/app/router";
import { cx } from "@/lib/cx";
import { panelKey } from "@/features/panel/surfaces";
import { useChatPlacement } from "@/features/project/page/chatPlacement";

/**
 * 下書きのタブを、いまの画面のプロジェクトのチャットのパネルで表示しているか（サイドバーの行を選択中に見せる。チャットの行が URL で
 * 選択中になるのと同じく、タブで選んでいるものがサイドバーで分かるように。利用者の依頼）。チャットのパネルが出ているのは、
 * チャットタブに分ける置き方ならチャットタブ、ボードの右に置くならボード（パネルが開いているときだけ = draft.showing）
 */
function useDraftSelected(draft: PanelDraft): boolean {
  const route = useRoute();
  const [placement] = useChatPlacement();
  if (!draft.showing || draft.panel !== panelKey("board", draft.projectId)) return false;
  if (route.name !== "project" || route.id !== draft.projectId) return false;
  return placement === "separate" ? route.tab === "chats" : route.tab === "board";
}

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
export function DraftRows({ drafts }: { drafts: readonly PanelDraft[] }) {
  if (drafts.length === 0) return null;
  return (
    <ul className="chat-rows draft-rows">
      {drafts.map((d) => (
        <DraftRow key={`${d.panel}:${d.key}`} draft={d} />
      ))}
    </ul>
  );
}

/** 下書きの 1 行（チャットの行の並びの中にも置ける。手動の並びでタブの位置に合わせるとき） */
export function DraftRow({ draft }: { draft: PanelDraft }) {
  const menu = useContextMenu();
  const selected = useDraftSelected(draft);
  return (
    <li className="chat-row-item">
      <button
        type="button"
        className={cx("chat-row draft-row", selected && "active")}
        aria-current={selected || undefined}
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
            {/* 名前は最初のチャットを送るまで「New Chat」のまま（タブと同じ。利用者の依頼で、前は書きかけの文の 1 行目を出していた） */}
            <span className="chat-row-title">{NEW_CHAT_TITLE}</span>
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
