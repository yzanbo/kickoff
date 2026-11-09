import type { Chat } from "@shared/types";
import { openChat } from "@/app/router";
import { paneOfTab, type SplitDir } from "@/features/panel/layout/paneTree";
import { panelActions } from "@/features/panel/state/panelActions";
import { panelStateOf } from "@/features/panel/state/panelStore";
import { panelKey } from "@/features/panel/surfaces";
import { chatKey } from "@/features/panel/tabs/tabKinds";

/**
 * チャットを、そのプロジェクトのチャットのパネルで右・下に分けて開く（サイドバーの行・ボードのカードの右クリック。タブの右クリックの「右に分けて開く」と同じ）。
 * タブで開いてから（開いていればそのタブ）、そのタブを新しいペインへ移し、チャットの画面へ移る
 */
export function openChatSplit(chat: Pick<Chat, "id" | "project_id">, dir: SplitDir) {
  const key = panelKey("board", chat.project_id);
  const actions = panelActions(key);
  actions.open(chat);
  const pane = paneOfTab(panelStateOf(key).layout, chatKey(chat.id));
  if (pane) actions.splitPane(pane.id, dir, "after", chatKey(chat.id));
  openChat(chat.project_id, chat.id);
}
