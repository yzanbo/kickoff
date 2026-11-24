// chatPanel の別ウィンドウの種類（URL の項目・中身・戻し方。ui/contributes.ts が popoutKinds に入れる）: サブエージェント・子チャット・チャットのタブの列のウィンドウ
import type { PopoutKind } from "@/foundation/ui/navigation/popout";
import { open as openTarget } from "@/foundation/ui/navigation/open";
import { knownChat, openChat, openInRootSide, screenOfChat } from "@/features/chat/ui";
import { newChatDraft } from "@/features/composer/ui";
import { newChatTab, panelKey, reopenInPanel, returnTabWindow } from "@/features/panel/ui";
import { ChatsTabWindowPage } from "./popout/ChatsTabWindowPage";
import { PopoutChildChat } from "./popout/PopoutChildChat";
import { SubagentPopoutPage } from "./popout/PopoutSubagent";

declare module "@/foundation/ui/navigation/popout" {
  interface PopoutParamsMap {
    /** サブエージェントの画面（agentKey はサブエージェントの一覧の行のキー） */
    subagent: { chatId: number; agentKey: string };
    /** 子チャット（チャットの画面そのもの。chatId は子チャット） */
    chat: { chatId: number };
    /**
     * チャットのパネルのチャット（いちばん上の親）・送る前の新しいチャットのタブ（panel は移す元の欄、key はタブのキー。chatId がなければ新しいチャットで、
     * 中身（書きかけの文・添付など）は composer の新しいチャットの下書き（同じキー）にあり、どのウィンドウからも読める）。開いた別ウィンドウはタブの列を持ち、ほかのチャットのタブもドラッグで足せる
     * （@/features/panel/ui/popout/tabWindow.ts）
     */
    chats: { panel: string; key: string; chatId?: number; projectId: number };
  }
}

/** 描かれるまで待ってから（開いたばかりのチャットの画面は、次の描画のあとにできる。2 秒まで） */
function whenDrawn(chatId: number, run: () => void, tries = 120) {
  if (screenOfChat(chatId)) return run();
  if (tries > 0) requestAnimationFrame(() => whenDrawn(chatId, run, tries - 1));
}

export const subagentPopout: PopoutKind<"subagent"> = {
  kind: "subagent",
  fields: { chatId: { kind: "number", param: "chat" }, agentKey: { kind: "string", param: "agent" } },
  label: "サブエージェント",
  Page: SubagentPopoutPage,
  // サブエージェントの画面は、そのチャットの画面の中にある（子チャットの画面には右の欄がないので、子チャットそのものを開く）
  dock: (route) => {
    const chat = knownChat(route.chatId);
    if (!chat) return;
    if (chat.parent_chat_id !== null) return openChat(chat, "side");
    openInRootSide(chat.id, () => whenDrawn(chat.id, () => screenOfChat(chat.id)?.subagents.openSide(route.agentKey)));
  },
};

export const chatPopout: PopoutKind<"chat"> = {
  kind: "chat",
  fields: { chatId: { kind: "number", param: "chat" } },
  label: "子チャット",
  // 子チャットは自分の帯（親を見る・親チャットに渡す・右の欄に戻す）を描き、いちばん上の親を「メインのチャット」にする
  Page: PopoutChildChat,
  bar: false,
  dock: (route) => {
    const chat = knownChat(route.chatId);
    if (chat) openChat(chat, "side");
  },
};

export const chatsPopout: PopoutKind<"chats"> = {
  kind: "chats",
  fields: { panel: "string", key: "string", projectId: { kind: "number", param: "project" }, chatId: { kind: "number?", param: "chat" } },
  label: "チャット",
  Page: ChatsTabWindowPage,
  dockLabel: () => ({ label: "チャットのパネルに戻す", tip: "メインのウィンドウのチャットのパネルで開き直して、このウィンドウを閉じる" }),
  // タブをすべてチャットのパネルに戻す
  returnSelf: (route) => returnTabWindow(route, "cwin"),
  dock: (route) => {
    // チャットのパネルで開く（移すときに「表示だけ消した」ことにしたのを、開くことで戻す）
    if (route.chatId !== undefined) return void openTarget({ kind: "chat", projectId: route.projectId, chatId: route.chatId });
    // 送る前の新しいチャット: 下書き（書きかけの文・添付は下書きの店にある）を、作成先のプロジェクトのチャットのパネルに開き直す
    const draft = newChatDraft(route.key);
    if (draft) reopenInPanel(panelKey("kanban", draft.projectId), newChatTab(draft.key));
  },
};
