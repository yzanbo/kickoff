// 別ウィンドウの「右の欄に戻す」: 別ウィンドウの中身を、メインのウィンドウのチャットの画面の右の欄で開き直す（メインのウィンドウで呼ぶ）。
// 子チャット・変更・ファイル・DB クライアントは結びついたチャット（子チャットなら、いちばん上の親）の右の欄、サブエージェントはそのチャットの右の欄、
// メモは開いたチャット（なければ、いま見えているチャット。いちばん上の親）の右の欄（チャットが見えていなければメモのタブ）
import type { PopoutRoute } from "@/app/popout";
import { openMemo } from "@/app/router";
import { knownChat } from "@/stores/chats";
import { openChildSide, openInRootSide } from "@/features/chat/children/openChild";
import { rootChatOf } from "@/features/chat/children/childChats";
import { chatPaneOf, shownChatIds } from "@/features/chat/pane/windowMessages";

/** 描かれるまで待ってから（開いたばかりのチャットの画面は、次の描画のあとにできる。2 秒まで） */
function whenDrawn(chatId: number, run: () => void, tries = 120) {
  if (chatPaneOf(chatId)) return run();
  if (tries > 0) requestAnimationFrame(() => whenDrawn(chatId, run, tries - 1));
}

export function dockPopout(route: PopoutRoute) {
  switch (route.kind) {
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
