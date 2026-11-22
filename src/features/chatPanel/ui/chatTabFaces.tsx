// チャットのパネル・チャットの画面の右の欄のタブの見た目（種類の Face）: サイドバーの行と同じ状態の印（useTabAgentState。未読・失敗のタブは名前も太字）、
// 子孫の子チャットの印（ChildActivityMark。動いていれば色付き）、作業場所の札、ピン（ピン留めしたチャット）。出すかはタブの列の「表示」のメニューの「タブに出す項目」（tabFields.ts）
import type { HTMLAttributes } from "react";
import { Paperclip } from "lucide-react";
import { StatusSlot, chatTitle, useKnownChat } from "@/features/chat/ui";
import { ChildActivityMark } from "@/features/childChats/ui";
import type { PanelTab, TabFaceProps } from "@/features/panel/ui";
import { draftTitleOf, useNewChatDraft } from "@/features/composer/ui";
import { draftGroupOf, hasDraftAttachments } from "./drafts/panelDrafts";
import { TabWorkplaceBadge } from "./tabs/TabWorkplaceBadge";
import { useChatTabHint } from "./tabs/useChatTabHint";
import { useTabAgentState, type TabAgentState } from "./tabs/useTabAgentState";

type FaceOf<K extends PanelTab["kind"]> = TabFaceProps<Extract<PanelTab, { kind: K }>>;

/** 先読みの見張りが読む印（チャット・子チャットのタブは、乗せて少し待ったら中身を先読みする。HTMLAttributes に data-* を書けないので、属性の束として渡す） */
const prefetchAttr = (chatId: number) => ({ "data-prefetch-chat": String(chatId) }) as HTMLAttributes<HTMLDivElement>;

/** 状態の印（状態を隠したときは、ほかの種類のタブと同じくアイコンを出す。未読・失敗の太字はそのまま） */
const stateFace = (agent: TabAgentState | undefined, show: (field: string) => boolean) => ({
  lead: agent && show("state") ? <StatusSlot state={agent.state} unread={agent.unread} label={agent.label} /> : undefined,
  unread: agent !== undefined && (agent.state === "unread" || agent.state === "failed" || agent.unread),
});

/**
 * 子孫の子チャットの印を名前の後ろに（チャットのタブは子・孫…、子チャットのタブはその下の孫…）。作業中・回答待ちの色付きの印は「状態」、
 * 動いていなくても子チャットがあることを出すのは「子チャット」（タブに出す項目）
 */
const activityOf = (chatId: number | undefined, show: (field: string) => boolean) =>
  chatId !== undefined && (show("state") || show("children")) ? <ChildActivityMark chatId={chatId} moving={show("state")} always={show("children")} /> : undefined;

/** チャットのタブ: 乗せたときの説明はプロジェクト・グループ・作業場所まで（useChatTabHint）、作業場所の札はそのチャットの作業場所 */
export function ChatTabFace({ tab, show, base, groupOf, render }: FaceOf<"chat">) {
  const chat = useKnownChat(tab.id);
  const agent = useTabAgentState(tab);
  const title = useChatTabHint(chat, base.label, base.group?.name);
  const tag = show("worktree") && chat ? <TabWorkplaceBadge chat={chat} /> : undefined;
  return render({
    ...stateFace(agent, show),
    // 名前とグループはいまのチャットから（タブの列は欄の状態が変わったときだけ描き直る）
    label: chat ? chatTitle(chat.title) : undefined,
    group: chat ? groupOf(tab.projectId, chat.group_id) : undefined,
    title,
    after: activityOf(chat?.id, show),
    tag,
    tagKey: tag && chat ? `${chat.worktree_path ?? ""}|${chat.branch ?? ""}` : undefined,
    pinnedIn: show("pin") && chat?.pinned ? chat.project_id : null,
    attrs: chat ? prefetchAttr(chat.id) : undefined,
  });
}

/** 新しいチャットのタブ: 名前・グループは下書きの店から（書くたびに描き直す）、作業場所の札は始める作業場所、書きかけの文がなく添付だけあれば添付の印 */
export function NewChatTabFace({ tab: t, show, groupOf, render }: FaceOf<"new">) {
  const draft = useNewChatDraft(t.key);
  if (!draft) return render({});
  const place = { project_id: draft.projectId, worktree_path: draft.worktree ?? null, branch: null };
  const tag = show("worktree") ? <TabWorkplaceBadge chat={place} /> : undefined;
  const attached = !draft.text.trim() && hasDraftAttachments(draft);
  return render({
    label: draftTitleOf(draft),
    group: draftGroupOf(t.key, groupOf),
    after: attached ? <Paperclip size={12} aria-label="添付あり" /> : undefined,
    tag,
    tagKey: tag ? `${place.worktree_path ?? ""}|` : undefined,
  });
}

/** 子チャットのタブ: 名前はいまの子チャットの名前（タブに覚えた名前は開いたときのもので、名前を変えると古いまま残った） */
export function ChildTabFace({ tab, show, render }: FaceOf<"child">) {
  const child = useKnownChat(tab.childId);
  const agent = useTabAgentState(tab);
  return render({
    ...stateFace(agent, show),
    label: child ? chatTitle(child.title) : undefined,
    after: activityOf(tab.childId, show),
    attrs: prefetchAttr(tab.childId),
  });
}

/** サブエージェントのタブ: 状態の印だけ */
export function SubagentTabFace({ tab, show, render }: FaceOf<"subagent">) {
  return render(stateFace(useTabAgentState(tab), show));
}
