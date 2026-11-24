// チャットのパネル・チャットの画面の右の欄のタブの種類（チャット・新しいチャット・サブエージェント・子チャット・新しい子チャット）。
// 中身は chatTabPages.tsx、見た目の足し替えは chatTabFaces.tsx、右クリックは chatTabMenus.tsx。ui/contributes.ts が panelTabs に入れる
import { Bot, MessageSquare, MessageSquarePlus, MessagesSquare, SquarePen } from "lucide-react";
import { CHAT_TITLE_MAX } from "@shared/chat/types";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { NEW_CHAT_TITLE, chatTitle, closeChatWithChoice, knownChat, prefetchChats, chatsApi } from "@/features/chat/ui";
import { ChildTabBadge } from "@/features/childChats/ui";
import { discardNewChatDraft, draftTitleOf, newChatDraft } from "@/features/composer/ui";
import { defineTabKind, type PanelTab } from "@/features/panel/ui";
import { ChatTabPage, ChildPage, NewChatPage, NewChildPage, SubagentPage } from "./chatTabPages";
import { ChatTabFace, ChildTabFace, NewChatTabFace, SubagentTabFace } from "./chatTabFaces";
import { ChatTabMenu, ChildTabMenu, NewChatTabMenu } from "./chatTabMenus";
import { draftGroupOf, setDraftTitle } from "./drafts/panelDrafts";
import { discardDraftSidePanel } from "./agents/draftSide";
import { chatTabLabel, chatTabWorkplace, reopenChatTab, subagentTabRules } from "./chatTabModel";

type TabOf<K extends PanelTab["kind"]> = Extract<PanelTab, { kind: K }>;

/** チャット・子チャットの名前を変える（名前を変える API） */
const renameChat = (chatId: number, title: string) => void chatsApi.renameChat(chatId, title).catch(reportFailure("名前を変更できませんでした"));

export const chatTabKind = defineTabKind<TabOf<"chat">>({
  id: "chat",
  icon: MessageSquare,
  iconClass: "muted",
  // チャットはタブに持たず、ID で知っているチャット（一覧 ∪ 詳細で見たもの）から引く。変わったら Face が描き直す
  label: (t) => chatTabLabel(t, knownChat(t.id)),
  group: (t, groupOf) => groupOf(t.projectId, knownChat(t.id)?.group_id),
  projectOf: (t) => t.projectId,
  ownerChatId: (t) => t.id,
  createWhen: "shown",
  workplaceOf: (t) => chatTabWorkplace(t, knownChat(t.id)),
  reopen: reopenChatTab,
  prefetch: (tabs) => prefetchChats(tabs.map((t) => t.id)),
  // × は表示だけ消す・アーカイブ・削除を選んでから閉じる（見出しには名前を出さない）
  close: (t, { close }) => void closeChatWithChoice({ id: t.id, title: t.title ?? "", archived_at: knownChat(t.id)?.archived_at }, (action) => close({ dismiss: action === "close" })),
  rename: { initial: (t) => t.title ?? "", max: CHAT_TITLE_MAX, submit: (t, name) => renameChat(t.id, name) },
  Menu: ChatTabMenu,
  Face: ChatTabFace,
  // ほかのウィンドウへ移す（チャットのパネルとの連動で足し直されないよう、元の欄からは表示だけ消す）
  transfer: {
    save: (t) => ({ kind: "chat", key: t.key, id: t.id, projectId: t.projectId }),
    load: (v) => (typeof v.id === "number" && typeof v.projectId === "number" ? { kind: "chat", key: v.key, id: v.id, projectId: v.projectId } : null),
    shownAs: "chat",
    dismiss: true,
  },
  // チャット（いちばん上の親）をタブの列のある別ウィンドウへ移す（panel の popout/tabWindow.ts）。サイドバーとの連動で足し直されないよう、表示だけ消したことにする
  popout: (t, panel) => ({
    route: { kind: "chats", panel, key: t.key, chatId: t.id, projectId: t.projectId },
    title: `${knownChat(t.id)?.title ?? t.title ?? "チャット"} — チャット`,
    dismiss: true,
  }),
  Page: ChatTabPage,
});

export const newChatTabKind = defineTabKind<TabOf<"new">>({
  id: "new",
  icon: SquarePen,
  // 表示だけ本文の冒頭にする（手動の名前があれば優先）。中身は下書きの店（変わったら Face が描き直す）
  label: (t) => draftTitleOf(newChatDraft(t.key)),
  // 作成先のグループ名（パネルの中で分かりしだい入れる。送ったあとのチャットのタブも同じく添える）
  group: (t, groupOf) => draftGroupOf(t.key, groupOf),
  projectOf: (t) => newChatDraft(t.key)?.projectId,
  // 送らずに閉じたら下書きとその右の欄も捨てる（送ったときは、先にできたチャットの右の欄へ移してある。別ウィンドウへ移すときは呼ばれない）
  dispose: (t) => {
    discardNewChatDraft(t.key);
    discardDraftSidePanel(t.key);
  },
  // 送ったらその名前のチャットになる
  rename: { initial: (t) => newChatDraft(t.key)?.title ?? "", max: CHAT_TITLE_MAX, submit: (t, name, panel) => setDraftTitle({ panel, key: t.key }, name) },
  Menu: NewChatTabMenu,
  Face: NewChatTabFace,
  // ほかのウィンドウへ移す（書きかけの文・添付は下書きの店にあるので、キーだけ渡す。チャットを出す欄が受ける）
  transfer: { save: (t) => ({ kind: "new", key: t.key }), load: (v) => ({ kind: "new", key: v.key }), shownAs: "chat" },
  // チャットの別ウィンドウへ移す（書きかけの文・添付は下書きの店にあるので、キーだけ渡す）
  popout: (t, panel) => {
    const draft = newChatDraft(t.key);
    return { route: { kind: "chats", panel, key: t.key, projectId: draft?.projectId ?? 0 }, title: `${draft?.title ?? NEW_CHAT_TITLE} — チャット` };
  },
  Page: NewChatPage,
});

export const subagentTabKind = defineTabKind<TabOf<"subagent">>({
  id: "subagent",
  icon: Bot,
  badge: "サブ",
  ...subagentTabRules,
  Face: SubagentTabFace,
  popout: (t) => ({ route: { kind: "subagent", chatId: t.chatId, agentKey: t.agentKey }, title: `${t.title} — サブエージェント` }),
  Page: SubagentPage,
});

export const childTabKind = defineTabKind<TabOf<"child">>({
  id: "child",
  icon: MessagesSquare,
  // 子チャットであることは札で見せる（名前の頭の「↳」だけだと、サブエージェントの入れ子と見分けにくい）
  badge: "子",
  // 孫より深いものは「孫」「ひ孫」にし、札と下線を深さの色にする（孫・ひ孫も同じ欄に子と並ぶので見分ける）
  BadgeText: ChildTabBadge,
  label: (t) => chatTitle(t.title),
  hint: (t) => `子チャット: ${chatTitle(t.title)}`,
  projectOf: (t) => t.projectId,
  // 子チャットを消したら閉じる（親を消すと子孫も消える）
  ownerChatId: (t) => t.childId,
  // チャットの ✕ と同じく閉じ方を聞く（表示だけ消す = タブを閉じる。子チャットは残る）
  close: (t, { close }) => void closeChatWithChoice({ id: t.childId, title: t.title, archived_at: knownChat(t.childId)?.archived_at }, () => close()),
  // 初めの値はいまの子チャットの名前（タブに覚えた名前は開いたときのもの）
  rename: { initial: (t) => knownChat(t.childId)?.title ?? t.title, max: CHAT_TITLE_MAX, submit: (t, name) => renameChat(t.childId, name) },
  Menu: ChildTabMenu,
  Face: ChildTabFace,
  popout: (t) => ({ route: { kind: "chat", chatId: t.childId }, title: `${chatTitle(t.title)} — 子チャット` }),
  Page: ChildPage,
});

export const newChildTabKind = defineTabKind<TabOf<"newChild">>({
  id: "newChild",
  icon: MessageSquarePlus,
  badge: "子",
  label: () => "新しい子チャット",
  hint: () => "新しい子チャット（このチャットの会話を引き継ぎ、最初の文を送ると始まります）",
  projectOf: (t) => t.projectId,
  // 親のチャットを消したら閉じる（孫を作るタブは、その親）
  ownerChatId: (t) => t.parentId ?? t.chatId,
  Page: NewChildPage,
});

export const CHAT_TAB_KINDS = [chatTabKind, newChatTabKind, subagentTabKind, childTabKind, newChildTabKind];
