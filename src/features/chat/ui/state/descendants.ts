// チャットの家系をたどる（祖先・いちばん上の親・子孫の状態）。子孫の状態は、入力欄の上の子チャットのピル・タブの子チャットの印・サイドバーの「子チャット n」が同じ数え方を使う
import type { AgentState, Chat } from "@shared/chat/types";
import { ancestors, walkDown } from "@shared/foundation/tree";

/** 親から根までの祖先（根 → 親の順。親のないチャットは空）。読み込んだ一覧になければ、たどれたところまで（輪になっていても止まる） */
export function ancestorsOf<T extends Pick<Chat, "id" | "parent_chat_id">>(chat: T, lookup: (id: number) => T | undefined): T[] {
  return ancestors(chat, (c) => (c.parent_chat_id === null ? undefined : lookup(c.parent_chat_id)), { key: (c) => c.id });
}

/** いちばん上の親（子チャットでないチャット）。親が読み込んだ一覧になければ、たどれたところまで（輪になっていても止まる） */
export function rootChatOf<T extends Pick<Chat, "id" | "parent_chat_id">>(chat: T, lookup: (id: number) => T | undefined): T {
  return ancestorsOf(chat, lookup)[0] ?? chat;
}

/**
 * 子孫の状態（木の順）。アーカイブ済みとその下は入れない（withArchived なら入れる。親ごとアーカイブしたとき）。
 * depth: 何段下まで数えるか（1 = 直接の子だけ。省けば全部）。輪になっていても止まる
 */
export function descendantStates(
  chatId: number,
  childrenOf: (id: number) => readonly Chat[] | undefined,
  stateOf: (chat: Chat) => AgentState,
  { withArchived = false, depth }: { withArchived?: boolean; depth?: number } = {},
): AgentState[] {
  const states: AgentState[] = [];
  walkDown(
    childrenOf(chatId) ?? [],
    (c) => childrenOf(c.id) ?? [],
    (c) => {
      if (c.archived_at && !withArchived) return false;
      states.push(stateOf(c));
    },
    { key: (c) => c.id, seen: [chatId], ...(depth !== undefined ? { max: depth - 1 } : {}) },
  );
  return states;
}
