// 子チャット（チャットの寄り道の質問を、親に紐づいた別のチャットで聞く）の親へ渡す文・子孫の並びと様子（純粋な部分。開き方は @/features/chat/ui の openChat）
import type { AgentState, Chat } from "@shared/chat/types";
import { summarizeStates } from "@shared/chat/stateLooks";
import { walkDown } from "@shared/foundation/tree";
import { chatTitle, descendantStates } from "@/features/chat/ui";

/** 子チャットに引用として渡す文の上限（文字。発言の全体を渡すときに長すぎないように） */
export const MAX_ASK_CHILD_QUOTE = 4000;

/** 子チャットの答えを親の入力欄に入れる文（どの子チャットの答えかを添えた引用） */
export function handBackText(child: Pick<Chat, "title">, answer: string): string {
  const quoted = answer
    .trim()
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
  return `子チャット「${chatTitle(child.title)}」の答え:\n${quoted}\n\n`;
}

/**
 * 子・孫・ひ孫…を、親の下に子が続く順（木の順。兄弟は最後に動いた順）に平らに並べ、深さ（1 = 子）を添える。アーカイブ済みとその下は入れない。
 * 輪になっていても止まる。タブの子チャットの印を押して開く一覧（ChildActivityMark）で使う
 */
export function descendantRows(chatId: number, childrenOf: ReadonlyMap<number, readonly Chat[]>): { chat: Chat; depth: number }[] {
  const rows: { chat: Chat; depth: number }[] = [];
  const kidsOf = (id: number) => [...(childrenOf.get(id) ?? [])].sort((a, b) => b.active_at.localeCompare(a.active_at) || b.id - a.id);
  walkDown(
    kidsOf(chatId),
    (c) => kidsOf(c.id),
    (c, depth) => {
      if (c.archived_at) return false;
      rows.push({ chat: c, depth: depth + 1 });
    },
    { key: (c) => c.id, seen: [chatId] },
  );
  return rows;
}

/** タブに出す子孫の様子（印の状態・作業中と回答待ちの数・アーカイブしていない子孫の数） */
export interface ChildActivity {
  /** 回答待ちがあれば回答待ち、作業中があれば作業中、どれも動いていなければ idle */
  state: "running" | "needs_input" | "idle";
  /** 作業中・回答待ちの子孫の数 */
  count: number;
  /** アーカイブしていない子孫（子・孫・ひ孫…）の数 */
  total: number;
}

/**
 * 子・孫・ひ孫…を数える（アーカイブ済みとその下は数えない。輪になっていても止まる）。子孫がなければ null。
 * 親のタブで、子チャットがあること・裏で動いていることを見せるため
 */
export function childActivityOf(chatId: number, childrenOf: ReadonlyMap<number, readonly Chat[]>, stateOf: (chat: Chat) => AgentState): ChildActivity | null {
  const states = descendantStates(chatId, (id) => childrenOf.get(id), stateOf);
  if (states.length === 0) return null;
  const { counts } = summarizeStates(states);
  return { state: counts.needs_input > 0 ? "needs_input" : counts.running > 0 ? "running" : "idle", count: counts.running + counts.needs_input, total: states.length };
}
