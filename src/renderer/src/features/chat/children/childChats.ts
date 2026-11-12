// 子チャット（チャットの寄り道の質問を、親に紐づいた別のチャットで聞く）の親へ渡す文・いちばん上の親（純粋な部分。開き方は openChild.ts）
import type { Chat } from "@shared/types";
import { chatTitle } from "@/features/chat/chatTitle";

/** 子チャットで聞くときに渡すもの（どのチャットの、どの記録から、どの文を。openAskChild） */
export interface AskChildTarget {
  parentId: number;
  eventId: number | null;
  quote: string;
}

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

/** 親から根までの祖先（根 → 親の順。親のないチャットは空）。読み込んだ一覧になければ、たどれたところまで（輪になっていても止まる） */
export function ancestorsOf<T extends Pick<Chat, "id" | "parent_chat_id">>(chat: T, lookup: (id: number) => T | undefined): T[] {
  const ancestors: T[] = [];
  const seen = new Set([chat.id]);
  let parentId = chat.parent_chat_id;
  while (parentId !== null && !seen.has(parentId)) {
    const parent = lookup(parentId);
    if (!parent) break;
    seen.add(parent.id);
    ancestors.unshift(parent);
    parentId = parent.parent_chat_id;
  }
  return ancestors;
}

/** いちばん上の親（子チャットでないチャット）。親が読み込んだ一覧になければ、たどれたところまで（輪になっていても止まる） */
export function rootChatOf<T extends Pick<Chat, "id" | "parent_chat_id">>(chat: T, lookup: (id: number) => T | undefined): T {
  return ancestorsOf(chat, lookup)[0] ?? chat;
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
 * 親のタブで、子チャットがあること・裏で動いていることを見せるため（利用者の依頼）
 */
export function childActivityOf(
  chatId: number,
  childrenOf: ReadonlyMap<number, readonly Chat[]>,
  stateOf: (chat: Chat) => string,
): ChildActivity | null {
  let running = 0;
  let waiting = 0;
  let total = 0;
  const seen = new Set([chatId]);
  const walk = (id: number) => {
    for (const c of childrenOf.get(id) ?? []) {
      if (c.archived_at || seen.has(c.id)) continue;
      seen.add(c.id);
      total++;
      const state = stateOf(c);
      if (state === "running") running++;
      else if (state === "needs_input") waiting++;
      walk(c.id);
    }
  };
  walk(chatId);
  if (total === 0) return null;
  return { state: waiting > 0 ? "needs_input" : running > 0 ? "running" : "idle", count: running + waiting, total };
}
