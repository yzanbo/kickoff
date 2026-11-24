// チャットの家系（いちばん上の親チャットから下にぶら下がるチャット）のたどり方。家系をたどるのはここの 4 つと、
// 純粋な並べ方・関係の呼び名（@shared/chat/family の familyOrder・familyRelation）だけ（輪でも止まる・深さの上限 20）
import { familyOrder, familyRelation } from "@shared/chat/family";
import type { Chat } from "@shared/chat/types";

/** 家系をたどるのに使う読み取り（店の store.chats が満たす。descendants は子孫を引く再帰の SQL） */
export interface ChatLookup {
  get(id: number): Chat | undefined;
  descendants(id: number): Chat[];
}

/** 系譜をたどる深さの上限（親子が輪になっていても止まるように） */
const MAX_DEPTH = 20;

/** いちばん上の親チャットから、そのチャット自身までの並び（たどれない親の手前で止まる） */
export function lineageOf(chats: Pick<ChatLookup, "get">, chat: Chat): Chat[] {
  const path = [chat];
  const seen = new Set([chat.id]);
  let parentId = chat.parent_chat_id;
  while (parentId !== null && !seen.has(parentId) && path.length <= MAX_DEPTH) {
    const parent = chats.get(parentId);
    if (!parent) break;
    seen.add(parent.id);
    path.unshift(parent);
    parentId = parent.parent_chat_id;
  }
  return path;
}

/** いちばん上の親チャットから何段目か（親のないチャット = 0） */
export function depthOf(chats: Pick<ChatLookup, "get">, chat: Chat): number {
  return lineageOf(chats, chat).length - 1;
}

/** 子孫（子・孫…。ゴミ箱のものは入れない。深いものから ID の順） */
export function descendantsOf(chats: Pick<ChatLookup, "descendants">, rootId: number): Chat[] {
  return chats.descendants(rootId);
}

/** 家系のチャット（親のすぐ下に子が続く並び）と、自分から見たそれぞれの関係の呼び名 */
export function familyOf(chats: ChatLookup, self: Chat): { members: Chat[]; relationOf(chat: Chat): string } {
  const root = lineageOf(chats, self)[0];
  const members = familyOrder(root, descendantsOf(chats, root.id));
  // いちばん上の親から、それぞれのチャットまでの ID の並び（関係の呼び名に使う）
  const paths = new Map<number, number[]>();
  for (const m of members) {
    const parentPath = m.parent_chat_id === null ? [] : (paths.get(m.parent_chat_id) ?? []);
    paths.set(m.id, [...parentPath, m.id]);
  }
  const selfPath = paths.get(self.id) ?? [self.id];
  return { members, relationOf: (chat) => familyRelation(selfPath, paths.get(chat.id) ?? [chat.id]) };
}
