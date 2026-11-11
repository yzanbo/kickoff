// 子チャット（チャットの寄り道の質問を、親に紐づいた別のチャットで聞く）の聞く画面の開き方・親へ渡す文・いちばん上の親（純粋な部分。開き方は openChild.ts）
import { useSyncExternalStore } from "react";
import type { Chat } from "@shared/types";
import { chatTitle } from "@/features/chat/chatTitle";

/** 聞く画面に渡すもの（どのチャットの、どの記録から、どの文を） */
export interface AskChildRequest {
  parentId: number;
  eventId: number | null;
  quote: string;
}

let request: AskChildRequest | null = null;
const listeners = new Set<() => void>();
const set = (next: AskChildRequest | null) => {
  request = next;
  listeners.forEach((l) => l());
};

/** 子チャットに引用として渡す文の上限（文字。発言の全体を渡すときに長すぎないように） */
export const MAX_ASK_CHILD_QUOTE = 4000;

/** 「新しい子チャットで聞く」の画面を開く（AskChildHost が出す） */
export const openAskChild = (next: AskChildRequest) => set(next);
export const closeAskChild = () => set(null);

/** 開いている「新しい子チャットで聞く」の画面（なければ null） */
export function useAskChildRequest(): AskChildRequest | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    () => request,
  );
}

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

/** タブに出す子孫の動き（作業中・回答待ちの子孫の数と、印の状態。回答待ちがあれば回答待ち） */
export interface ChildActivity {
  state: "running" | "needs_input";
  count: number;
}

/**
 * 子・孫・ひ孫…のうち、作業中・回答待ちのものを数える（アーカイブ済みとその下は数えない。輪になっていても止まる）。
 * どれもなければ null。親のタブで、裏で子チャットが動いていることを見せるため（利用者の依頼）
 */
export function childActivityOf(
  chatId: number,
  childrenOf: ReadonlyMap<number, readonly Chat[]>,
  stateOf: (chat: Chat) => string,
): ChildActivity | null {
  let running = 0;
  let waiting = 0;
  const seen = new Set([chatId]);
  const walk = (id: number) => {
    for (const c of childrenOf.get(id) ?? []) {
      if (c.archived_at || seen.has(c.id)) continue;
      seen.add(c.id);
      const state = stateOf(c);
      if (state === "running") running++;
      else if (state === "needs_input") waiting++;
      walk(c.id);
    }
  };
  walk(chatId);
  if (running + waiting === 0) return null;
  return { state: waiting > 0 ? "needs_input" : "running", count: running + waiting };
}
