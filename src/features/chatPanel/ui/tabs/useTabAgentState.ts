import { busyWithUnread } from "@shared/chat/state";
import { subagentState } from "@shared/chat/subagentState";
import type { AgentState } from "@shared/chat/types";
import { useChatStates } from "@/features/chat/ui/state/chatStates";
import { useKnownChat } from "@/features/chat/ui/store/knownChats";
import { chatSubagents } from "@/features/subagents/ui";
import { subagentStatusLabel } from "@/features/subagents/ui/model/subagentList";
import type { PanelTab } from "@/features/panel/ui/tabs/panelTypes";

/** タブの名前の前に出すエージェントの状態（印 StatusSlot と、未読・失敗の太字に使う） */
export interface TabAgentState {
  state: AgentState;
  /** 作業中のまま、まだ見ていない返答がある（リングに未読の点を重ねる） */
  unread: boolean;
  /** 印に乗せたときの文（なければ状態の名前。サブエージェントは細かい様子の文） */
  label?: string;
}

/**
 * タブのエージェントの状態: チャット・子チャット（サイドバーの行と同じ chatStateOf）・サブエージェント（subagentState）を同じ 5 つの状態で返す。
 * どの欄のタブも同じ印・同じ太字の決まりで見せるため。
 * 状態のないタブ（ブラウザ・ファイルなど）・分からないもの（子チャットがまだ読み込まれていない・巻き戻して消えたサブエージェント）は undefined
 */
export function useTabAgentState(tab: PanelTab): TabAgentState | undefined {
  const { stateOf } = useChatStates();
  // hooks は種類によらず呼ぶ（チャット・子チャットでなければ ID 0 = いつも分からない）
  const chat = useKnownChat(tab.kind === "chat" ? tab.id : tab.kind === "child" ? tab.childId : 0);
  // サブエージェントのタブは、チャットの店の取り出し口を直接読む（チャットの会話の欄が隠れて止まっていても、印は変わる。ほかの種類は ID 0 = いつも空）
  const view = chatSubagents.useFor(tab.kind === "subagent" ? tab.chatId : 0);
  if (chat) {
    const state = stateOf(chat);
    return { state, unread: busyWithUnread(chat, state) };
  }
  if (tab.kind !== "subagent") return undefined;
  const entry = view.tree.byKey.get(tab.agentKey);
  if (!entry) return undefined;
  // 回答待ちの依頼を出していれば回答待ち（チャットのタブと同じ ！ の印）
  const waiting = view.waiting.has(entry.key);
  return { state: subagentState(entry, waiting).state, unread: false, label: subagentStatusLabel(entry, waiting) };
}
