// 別ウィンドウの「右の欄に戻す」: 別ウィンドウの中身を、メインのウィンドウのチャットの画面の右の欄で開き直す（メインのウィンドウで呼ぶ）。
// 子チャット・変更・ファイル・DB クライアントは結びついたチャット（子チャットなら、いちばん上の親）の右の欄、サブエージェントはそのチャットの右の欄、
// メモは開いたチャット（なければ、いま見えているチャット。いちばん上の親）の右の欄（チャットが見えていなければメモのタブ）。サイドバーはこのウィンドウのサイドバーを開く。
// パネルのブラウザ・ターミナルのタブは元の欄に開き直す（ターミナルはシェルの持ち主をこのウィンドウにしてから。別ウィンドウが閉じてもシェルを止めさせない）
import type { PopoutRoute } from "@/foundation/ui/navigation/popout";
import { navigate, openChat, openMemo } from "@/foundation/ui/navigation/router";
import { writeSetting } from "@/foundation/ui/storage/settings";
import { SIDEBAR_OPEN } from "@/foundation/ui/storage/storageKeys";
import { knownChat } from "@/features/chat/ui/store/knownChats";
import { openChildSide, openInRootSide } from "@/features/chat/ui/open/openChat";
import { rootChatOf } from "@/features/childChats/ui/childChats";
import { chatPaneOf, shownChatIds } from "@/features/chat/ui/screen/chatScreens";
import { panelActions } from "@/features/panel/ui/state/panelActions";
import { isPanelMounted } from "@/features/panel/ui/state/panelStore";
import { panelKey, panelScreen } from "@/features/panel/ui/surfaces";
import type { PanelTab } from "@/features/panel/ui/tabs/panelTypes";
import { takeHandedTab } from "@/features/panel/ui/tabs/tabHandoff";
import { claimTerminal } from "@/features/terminal/ui/terminalOwner";

/** 描かれるまで待ってから（開いたばかりのチャットの画面は、次の描画のあとにできる。2 秒まで） */
function whenDrawn(chatId: number, run: () => void, tries = 120) {
  if (chatPaneOf(chatId)) return run();
  if (tries > 0) requestAnimationFrame(() => whenDrawn(chatId, run, tries - 1));
}

/** 欄にタブを開き直す（その欄が画面になければ、その画面へ移ってから） */
function reopenInPanel(panel: string, tab: PanelTab) {
  const screen = isPanelMounted(panel) ? undefined : panelScreen(panel);
  if (screen) navigate(screen);
  panelActions(panel).openPanelTab(tab);
}

export async function dockPopout(route: PopoutRoute): Promise<void> {
  switch (route.kind) {
    case "browser":
      // ブラウザは右サイドバーだけに置く（ブラウザの別ウィンドウから、さらに移したタブも）
      reopenInPanel(route.projectId !== null ? panelKey("side", route.projectId) : route.panel, { key: route.key, kind: "browser", url: route.url, title: route.title });
      return;
    case "chats": {
      // チャットのパネルで開く（移すときに「表示だけ消した」ことにしたのを、開くことで戻す）
      if (route.chatId !== undefined) return openChat(route.projectId, route.chatId);
      // 送る前の新しいチャット: 別ウィンドウが渡した中身（書きかけの文・添付）のまま、チャットのパネルに開き直す
      const draft = takeHandedTab(route.key);
      if (draft) reopenInPanel(panelKey("board", route.projectId), draft);
      return;
    }
    case "terminal": {
      const { kind: _kind, panel, ...tab } = route;
      await claimTerminal(tab.key);
      reopenInPanel(panel, { kind: "terminal", ...tab });
      return;
    }
    case "sidebar":
      writeSetting(SIDEBAR_OPEN, true);
      return;
    case "chat": {
      const chat = knownChat(route.chatId);
      if (chat) openChildSide(chat);
      return;
    }
    case "subagent": {
      // サブエージェントの画面は、そのチャットの画面の中にある（子チャットの画面には右の欄がないので、子チャットそのものを開く）
      const chat = knownChat(route.chatId);
      if (!chat) return;
      if (chat.parent_chat_id !== null) return openChildSide(chat);
      openInRootSide(chat.id, () => whenDrawn(chat.id, () => chatPaneOf(chat.id)?.openSubagentSide(route.agentKey)));
      return;
    }
    case "database":
      openInRootSide(route.chatId, (rootId, side) => side.openDatabase({ chatId: rootId, projectId: route.projectId, ...(route.worktree ? { worktree: route.worktree } : {}) }));
      return;
    case "changes":
    case "file": {
      const place = { projectId: route.projectId, ...(route.worktree ? { worktree: route.worktree } : {}) };
      openInRootSide(route.chatId, (rootId, side) =>
        route.kind === "changes" ? side.openChanges({ chatId: rootId, ...place, focus: route.focus }) : side.openFile({ chatId: rootId, ...place, path: route.path, line: route.line }),
      );
      return;
    }
    case "memo": {
      // 開いたチャット（なければ、いま見えているチャットのうち、そのプロジェクトのもの。子チャットなら、いちばん上の親）
      const shown =
        (route.chatId !== undefined ? knownChat(route.chatId) : undefined) ??
        shownChatIds()
          .map((id) => knownChat(id))
          .find((c) => c?.project_id === route.projectId);
      const root = shown && rootChatOf(shown, knownChat);
      if (!root || !openInRootSide(root.id, (rootId, side) => side.openMemo({ chatId: rootId, projectId: route.projectId, path: route.path }))) openMemo(route.projectId, route.path);
      return;
    }
  }
}
