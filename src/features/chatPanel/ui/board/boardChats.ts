import type { Chat } from "@shared/chat/types";
import { open } from "@/foundation/ui/navigation/open";
import { openNewChat, useDraftsInPanels, type PlacedDraft } from "@/features/chatPanel/ui/drafts/panelDrafts";
import { panelKey } from "@/features/panel/ui";
import type { PanelController } from "@/features/panel/ui";
import type { NewChatPlace } from "@/features/chat/ui";
import type { useBoardPanel } from "./useBoardPanel";

/**
 * プロジェクトのボードからチャットを開く先（設定の「チャットの置き方」で決まる）: ボードの右のパネル（panelChats）か、
 * ボードと分けた「チャット」タブ（useChatsTabLinks。開くとそのタブへ移る）。ボードはこれだけを見て、どちらかで分岐しない
 */
export interface BoardChats {
  /** ボードの右のパネル（ボードの右で開く置き方のときだけ。BoardShell に渡す） */
  rightPanel?: ReturnType<typeof useBoardPanel>;
  /** カードを選択中として見せる・ツールバーのパネルの開閉（ボードの右で開く置き方のときだけ） */
  panel?: PanelController;
  /** ボードに出す下書き（このプロジェクトのパネルとチャット欄で書いている途中のもの） */
  drafts: readonly PlacedDraft[];
  /** カード・行・右クリックの「開く」 */
  open: (chat: Chat) => void;
  /** グループの列の＋など、作成先を決めた新しいチャット */
  openNew: (target: NewChatPlace) => void;
}

/** ボードの右のパネルで開く */
export function panelChats(rightPanel: ReturnType<typeof useBoardPanel>): BoardChats {
  return {
    rightPanel,
    panel: rightPanel.panel,
    drafts: rightPanel.drafts,
    open: rightPanel.open,
    openNew: (target) => void openNewChat(rightPanel.panel.key, target),
  };
}

/** ボードと分けた「チャット」タブへ移って開く（パネルはそのタブが持つ。ボードは下書きを出すだけ） */
export function useChatsTabLinks(projectId: number): BoardChats {
  const drafts = useDraftsInPanels([panelKey("kanban", projectId), panelKey("side", projectId)]);
  return {
    drafts,
    open: (chat) => open({ kind: "chat", projectId: chat.project_id, chatId: chat.id }),
    openNew: (target) => open({ kind: "newChat", projectId: target.projectId, groupId: target.group, worktree: target.worktree }),
  };
}
