import type { Chat } from "@shared/chat/types";
import { open } from "@/foundation/ui/navigation/open";
import { paneOfTab, type SplitDir } from "@/features/panel/ui/layout/paneTree";
import { chatKey, chatTab, openTab, panelKey, panelStateOf, splitPane } from "@/features/panel/ui";
import { forwardPanelOp } from "@/features/panel/ui/state/panelMirror";

/**
 * チャットを、そのプロジェクトのチャットのパネルで右・下に分けて開く（サイドバーの行・ボードのカードの右クリック。タブの右クリックの「右に分けて開く」と同じ）。
 * タブで開いてから（開いていればそのタブ）、そのタブを新しいペインへ移し、チャットの画面へ移る
 */
export function openChatSplit(chat: Pick<Chat, "id" | "project_id">, dir: SplitDir) {
  // サイドバーの別ウィンドウからは、メインのウィンドウのパネルで
  if (forwardPanelOp({ op: "openChatSplit", chat: { id: chat.id, project_id: chat.project_id }, dir }, { focusMain: true })) return;
  const key = panelKey("kanban", chat.project_id);
  openTab(key, chatTab(chat));
  const pane = paneOfTab(panelStateOf(key).layout, chatKey(chat.id));
  if (pane) splitPane(key, pane.id, dir, "after", chatKey(chat.id));
  open({ kind: "chat", projectId: chat.project_id, chatId: chat.id });
}
