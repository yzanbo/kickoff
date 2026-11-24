// チャットのタブの種類（chatTabKinds.ts）の決め方のうち、部品を読まない純粋なもの（名前・作業場所・開き直し・サブエージェントのタブの名前と持ち主）
import type { Chat } from "@shared/chat/types";
import { chatTitle } from "@/features/chat/ui";
import type { defineTabKind, PanelTab } from "@/features/panel/ui";

type TabOf<K extends PanelTab["kind"]> = Extract<PanelTab, { kind: K }>;
type KindSpec<K extends PanelTab["kind"]> = Parameters<typeof defineTabKind<TabOf<K>>>[0];

/** チャットのタブの名前: 知っているチャットの最新の名前 → タブが覚えた名前（まだ届いていないチャット）→ 「チャット」 */
export function chatTabLabel(t: TabOf<"chat">, chat: Pick<Chat, "title"> | undefined): string {
  const title = chat?.title ?? t.title;
  return title === undefined ? "チャット" : chatTitle(title);
}

/** タブの列からターミナルを開く場所: チャットの作業場所（チャットがまだ届いていなければ、タブのプロジェクトの本体） */
export const chatTabWorkplace = (t: TabOf<"chat">, chat: Pick<Chat, "project_id" | "worktree_path"> | undefined) => ({
  projectId: chat?.project_id ?? t.projectId,
  worktree: chat?.worktree_path ?? null,
});

/** 検索結果から開き直したら、強調する発言だけ変える */
export const reopenChatTab: NonNullable<KindSpec<"chat">["reopen"]> = (t) => (t.focus ? { kind: "chat", fields: { focus: t.focus } } : undefined);

/** サブエージェントのタブの名前・説明・持ち主 */
export const subagentTabRules: Pick<KindSpec<"subagent">, "label" | "hint" | "projectOf" | "ownerChatId"> = {
  // サブエージェントの中で起動したもの（入れ子）は「↳」を付け、乗せると外側からの道筋（「調査 › 洗い出し」）
  label: (t) => (t.path ? `↳ ${t.title}` : t.title),
  hint: (t) => t.path ?? t.title,
  projectOf: () => undefined,
  // そのチャットを消したら閉じる（チャットごとの欄なので、欄ごと使われなくなる）
  ownerChatId: (t) => t.chatId,
};
