import type { Chat } from "@shared/chat/types";
import { openChat } from "@/foundation/ui/navigation/router";
import { paneOfTab, type SplitDir } from "@/features/panel/ui/layout/paneTree";
import { panelActions } from "@/features/panel/ui/state/panelActions";
import { forwardPanelOp } from "@/features/panel/ui/state/panelMirror";
import { panelStateOf } from "@/features/panel/ui/state/panelStore";
import { panelKey } from "@/features/panel/ui/surfaces";
import { chatKey } from "@/features/panel/ui/tabs/tabKinds";

/**
 * チャットを、そのプロジェクトのチャットのパネルで右・下に分けて開く（サイドバーの行・ボードのカードの右クリック。タブの右クリックの「右に分けて開く」と同じ）。
 * タブで開いてから（開いていればそのタブ）、そのタブを新しいペインへ移し、チャットの画面へ移る
 */
export function openChatSplit(chat: Pick<Chat, "id" | "project_id">, dir: SplitDir) {
  // サイドバーの別ウィンドウからは、メインのウィンドウのパネルで
  if (forwardPanelOp({ op: "openChatSplit", chat: { id: chat.id, project_id: chat.project_id }, dir }, { focusMain: true })) return;
  const key = panelKey("board", chat.project_id);
  const actions = panelActions(key);
  actions.open(chat);
  const pane = paneOfTab(panelStateOf(key).layout, chatKey(chat.id));
  if (pane) actions.splitPane(pane.id, dir, "after", chatKey(chat.id));
  openChat(chat.project_id, chat.id);
}
