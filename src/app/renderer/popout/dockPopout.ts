// 別ウィンドウの「右の欄に戻す」: 別ウィンドウの中身を、メインのウィンドウのチャットの画面の右の欄で開き直す（メインのウィンドウで呼ぶ）。
// 子チャット・変更・ファイル・DB クライアントは結びついたチャット（子チャットなら、いちばん上の親）の右の欄、サブエージェントはそのチャットの右の欄、
// ノートは開いたチャット（なければ、いま見えているチャット。いちばん上の親）の右の欄（チャットが見えていなければノートのタブ）。サイドバーはこのウィンドウのサイドバーを開く。
// パネルのブラウザ・ターミナルのタブは元の欄に開き直す（ターミナルはシェルの持ち主をこのウィンドウにしてから。別ウィンドウが閉じてもシェルを止めさせない）
import type { PopoutRoute } from "@/foundation/ui/navigation/popout";
import { open as openTarget } from "@/foundation/ui/navigation/open";
import { navigate } from "@/foundation/ui/navigation/router";
import { writeSetting } from "@/foundation/ui/storage";
import { sidebarSettings } from "@/features/sidebar/ui";
import { knownChat, openChat, openInRootSide, rootChatOf, screenOfChat, shownChatIds } from "@/features/chat/ui";
import { changesTab, databaseTab, fileTab, isPanelMounted, noteTab, openTab, panelKey, panelScreen, reopenOf } from "@/features/panel/ui";
import type { PanelTab } from "@/features/panel/ui/tabs/panelTypes";
import { takeHandedTab } from "@/features/panel/ui/tabs/tabHandoff";
import { claimTerminal } from "@/features/terminal/ui/terminalOwner";

/** 描かれるまで待ってから（開いたばかりのチャットの画面は、次の描画のあとにできる。2 秒まで） */
function whenDrawn(chatId: number, run: () => void, tries = 120) {
  if (screenOfChat(chatId)) return run();
  if (tries > 0) requestAnimationFrame(() => whenDrawn(chatId, run, tries - 1));
}

/** 欄にタブを開き直す（その欄が画面になければ、その画面へ移ってから） */
function reopenInPanel(panel: string, tab: PanelTab) {
  const screen = isPanelMounted(panel) ? undefined : panelScreen(panel);
  if (screen) navigate(screen);
  openTab(panel, tab);
}

export async function dockPopout(route: PopoutRoute): Promise<void> {
  switch (route.kind) {
    case "browser":
      // ブラウザは右サイドバーだけに置く（ブラウザの別ウィンドウから、さらに移したタブも）
      reopenInPanel(route.projectId !== null ? panelKey("side", route.projectId) : route.panel, { key: route.key, kind: "browser", url: route.url, title: route.title });
      return;
    case "chats": {
      // チャットのパネルで開く（移すときに「表示だけ消した」ことにしたのを、開くことで戻す）
      if (route.chatId !== undefined) return void openTarget({ kind: "chat", projectId: route.projectId, chatId: route.chatId });
      // 送る前の新しいチャット: 別ウィンドウが渡した中身（書きかけの文・添付）のまま、チャットのパネルに開き直す
      const draft = takeHandedTab(route.key);
      if (draft) reopenInPanel(panelKey("kanban", route.projectId), draft);
      return;
    }
    case "terminal": {
      const { kind: _kind, panel, ...tab } = route;
      await claimTerminal(tab.key);
      reopenInPanel(panel, { kind: "terminal", ...tab });
      return;
    }
    case "sidebar":
      writeSetting(sidebarSettings.open, true);
      return;
    case "chat": {
      const chat = knownChat(route.chatId);
      if (chat) openChat(chat, "side");
      return;
    }
    case "subagent": {
      // サブエージェントの画面は、そのチャットの画面の中にある（子チャットの画面には右の欄がないので、子チャットそのものを開く）
      const chat = knownChat(route.chatId);
      if (!chat) return;
      if (chat.parent_chat_id !== null) return openChat(chat, "side");
      openInRootSide(chat.id, () => whenDrawn(chat.id, () => screenOfChat(chat.id)?.subagents.openSide(route.agentKey)));
      return;
    }
    case "database":
      openInRootSide(route.chatId, (rootId, side) => openTab(side, databaseTab({ chatId: rootId, projectId: route.projectId, ...(route.worktree ? { worktree: route.worktree } : {}) })));
      return;
    case "changes":
    case "file": {
      const place = { projectId: route.projectId, ...(route.worktree ? { worktree: route.worktree } : {}) };
      openInRootSide(route.chatId, (rootId, side) => {
        const tab = route.kind === "changes" ? changesTab({ chatId: rootId, ...place, focus: route.focus }) : fileTab({ chatId: rootId, ...place, path: route.path, line: route.line });
        openTab(side, tab, reopenOf(tab));
      });
      return;
    }
    case "note": {
      // 開いたチャット（なければ、いま見えているチャットのうち、そのプロジェクトのもの。子チャットなら、いちばん上の親）
      const shown =
        (route.chatId !== undefined ? knownChat(route.chatId) : undefined) ??
        shownChatIds()
          .map((id) => knownChat(id))
          .find((c) => c?.project_id === route.projectId);
      const root = shown && rootChatOf(shown, knownChat);
      if (!root || !openInRootSide(root.id, (rootId, side) => openTab(side, noteTab({ chatId: rootId, projectId: route.projectId, path: route.path })))) openTarget({ kind: "note", projectId: route.projectId, path: route.path });
      return;
    }
  }
}
