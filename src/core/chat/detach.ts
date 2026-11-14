// 子チャットを親から外す（親のないチャットにする・自分の先祖の子に上げる）。HTTP の口（POST /api/chats/:id/detach）と AI の update_chat で共通。
// 付け替え（別の子チャット・関係のないチャットの下へ置く）はしない。子チャットの AI が覚えているのは元の親（と先祖）の会話なので、
// 先祖の下までなら「親チャットに渡す」の中身と渡し先の文脈がずれにくい（2026-11-14 に利用者と決めた。メモの仕様書「子チャットを親から外す」）
import type { Chat } from "@shared/types";
import type { Store } from "../db/store.js";
import { Conflict, Invalid } from "../http/errors.js";
import { requireGroupOf } from "../http/lookups.js";
import { lineageOf } from "./aiChatEdit.js";

/** 外す先: parentId が null なら親のないチャット（groupId のグループへ。null・省略ならグループなし）、先祖の ID ならその子 */
export interface DetachTarget {
  parentId: number | null;
  groupId?: number | null;
}

/** 文の中の名前（空なら「名前なし」） */
const nameOf = (chat: Chat) => chat.title.trim() || "（名前なし）";

/**
 * 子チャットを親から外す。断るもの: 親のないチャット・先祖でない ID（いまの親も。もうその子なので）・親なしでないときのグループ・
 * ほかのプロジェクトのグループ・作業中（isBusy。その下の孫などが作業中でも、外すのはこのチャットだけなので断らない）。
 * 外すと、親のどの発言から聞いたか（parent_event_id）と「親と一緒にアーカイブした」印を消し（アーカイブ済みならアーカイブ済みのまま。
 * 親を戻しても一緒には戻らない）、記録にお知らせを残す。子孫は一緒についていく（親子のつながりはそのまま）。外したあとのチャットを返す
 */
export function detachChat(store: Store, isBusy: (chatId: number) => boolean, chat: Chat, target: DetachTarget): Chat {
  if (chat.parent_chat_id === null) throw new Invalid("親のないチャットです（外せるのは子チャットだけです）");
  const parent = store.chats.get(chat.parent_chat_id);
  // 先祖（いちばん上の親から、親の親まで。自分といまの親は除く）
  const ancestors = lineageOf(store, chat).slice(0, -2);
  const to = target.parentId === null ? null : ancestors.find((a) => a.id === target.parentId);
  if (target.parentId !== null && !to) {
    throw new Invalid(
      target.parentId === chat.parent_chat_id
        ? "もうそのチャットの子チャットです"
        : "上げられるのは、自分の先祖（親の親より上のチャット）の子だけです（ほかのチャットの下へは付け替えられません）",
    );
  }
  const groupId = target.groupId ?? null;
  if (groupId !== null) {
    if (to) throw new Invalid("グループに入れられるのは親のないチャットだけです");
    requireGroupOf(store, groupId, chat.project_id);
  }
  if (isBusy(chat.id)) throw new Conflict("作業中のチャットは親から外せません。終わってから（または中断してから）行ってください");

  const detached = store.chats.detach(chat.id, to?.id ?? null, groupId);
  const from = parent ? `「${nameOf(parent)}」` : "親チャット";
  store.events.add(chat.id, { type: "notice", message: to ? `${from}から「${nameOf(to)}」の子にしました` : `${from}から外しました` });
  return detached;
}
