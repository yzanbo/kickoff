// チャットの置き場所の口: チャットのパネル・チャットの画面の右の欄・チャットの別ウィンドウの住所と、そこへ開く関数。
// 右の欄に開く側（子チャット・サブエージェント・ファイルのチップ・ノートの札・AI の open_file など）は chatPanel より下の機能なので、住所はここに置く。
// 欄の決まりと描き方は chatPanel（chatSurfaces.ts）
import { open } from "@/foundation/ui/navigation/open";
import { chatKey, chatTab, forwardPanelOp, isTabVisible, openTab, panelKey, panelStateOf, paneOfTab, splitPane, usePanelState, type DraftScope, type SplitDir } from "@/features/panel/ui";

/** 欄の名前（覚える状態の名前の頭。変えない） */
export const CHAT_SIDE_SURFACE = "agents";
export const CHATS_SURFACE = "kanban";

/** チャットの画面の右の欄の住所（いちばん上の親のチャットの ID か、送る前の新しいチャットの下書きの範囲） */
export const chatSidePanel = (scope: number | DraftScope) => panelKey(CHAT_SIDE_SURFACE, scope);

/** プロジェクトのチャットのパネルの住所 */
export const chatsPanel = (projectId: number) => panelKey(CHATS_SURFACE, projectId);

/** そのタブを、チャットの画面の右の欄で表示しているか（右の欄が開いていて、どれかのペインで表示中。流れの中のカードの「右の欄で表示中」） */
export function useShownInChatSide(chatId: number, tabKey: string): boolean {
  const state = usePanelState(chatSidePanel(chatId));
  return state.open && isTabVisible(state.layout, tabKey);
}

/**
 * チャットを、そのプロジェクトのチャットのパネルで開き、チャットの画面へ移る。split なら右・下に分けて開く（サイドバーの行・ボードのカードの右クリック。
 * タブで開いてから（開いていればそのタブ）、そのタブを新しいペインへ移す。サイドバーの別ウィンドウからは、メインのウィンドウのパネルで）
 */
export function openChatTab(chat: { id: number; project_id: number }, { split }: { split?: SplitDir } = {}): void {
  if (split && forwardPanelOp({ op: "openChatSplit", chat: { id: chat.id, project_id: chat.project_id }, dir: split }, { focusMain: true })) return;
  const key = chatsPanel(chat.project_id);
  openTab(key, chatTab(chat));
  const pane = split ? paneOfTab(panelStateOf(key).layout, chatKey(chat.id)) : undefined;
  if (split && pane) splitPane(key, pane.id, split, "after", chatKey(chat.id));
  open({ kind: "chat", projectId: chat.project_id, chatId: chat.id });
}
