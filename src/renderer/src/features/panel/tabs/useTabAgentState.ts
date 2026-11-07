import { busyWithUnread } from "@shared/chat/state";
import { subagentState } from "@shared/chat/subagentState";
import type { AgentState } from "@shared/types";
import { useChatStates } from "@/app/chatStatesContext";
import { useKnownChat } from "@/stores/chats";
import { useSubagentsView } from "@/features/chat/subagents/subagentsContext";
import { subagentStatusLabel } from "@/features/chat/subagents/subagentList";
import type { PanelController } from "@/features/panel/usePanel";
import type { PanelTab } from "./panelTypes";

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
 * どの欄のタブも同じ印・同じ太字の決まりで見せるため（以前は子チャットのタブが太字にならず、サブエージェントのタブはツールと同じ ✓ ✕ だった）。
 * 状態のないタブ（ブラウザ・ファイルなど）・分からないもの（子チャットがまだ読み込まれていない・巻き戻して消えたサブエージェント）は undefined
 */
export function useTabAgentState(panel: PanelController, tab: PanelTab): TabAgentState | undefined {
  const { stateOf } = useChatStates();
  // hooks は種類によらず呼ぶ（子チャットでなければ ID 0 = いつも分からない）
  const child = useKnownChat(tab.kind === "child" ? tab.childId : 0);
  const view = useSubagentsView();
  const chat = tab.kind === "chat" ? panel.chatOf(tab) : tab.kind === "child" ? child : undefined;
  if (chat) {
    const state = stateOf(chat);
    return { state, unread: busyWithUnread(chat, state) };
  }
  if (tab.kind !== "subagent") return undefined;
  const entry = view?.tree.byKey.get(tab.agentKey);
  if (!entry) return undefined;
  return { state: subagentState(entry).state, unread: false, label: subagentStatusLabel(entry) };
}
