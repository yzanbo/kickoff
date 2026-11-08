import type { Chat } from "@shared/types";
import { openChat, openNewChat } from "@/app/router";
import { usePanelDrafts, type PanelDraft } from "@/features/panel/state/panelDrafts";
import { panelKey } from "@/features/panel/surfaces";
import type { NewChatTarget, PanelController } from "@/features/panel/usePanel";
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
  drafts: readonly PanelDraft[];
  /** カード・行・右クリックの「開く」 */
  open: (chat: Chat) => void;
  /** グループの列の＋など、作成先を決めた新しいチャット */
  openNew: (target: NewChatTarget) => void;
}

/** ボードの右のパネルで開く */
export function panelChats(rightPanel: ReturnType<typeof useBoardPanel>): BoardChats {
  return {
    rightPanel,
    panel: rightPanel.panel,
    drafts: rightPanel.drafts,
    open: rightPanel.open,
    openNew: (target) => rightPanel.panel.openNew(target),
  };
}

/** ボードと分けた「チャット」タブへ移って開く（パネルはそのタブが持つ。ボードは下書きを出すだけ） */
export function useChatsTabLinks(projectId: number): BoardChats {
  const drafts = usePanelDrafts([panelKey("board", projectId), panelKey("side", projectId)]);
  return {
    drafts,
    open: (chat) => openChat(chat.project_id, chat.id),
    openNew: (target) => openNewChat(target.projectId, { group: target.group }),
  };
}
