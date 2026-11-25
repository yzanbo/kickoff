import type { Chat } from "@shared/chat/types";

/**
 * 見ている最中に手で未読にしたチャットの覚え（一番下まで見たら既読にする設定で、同じ画面にいる間は既読に戻さないため）。
 * 未読にしたときの「最後に動いた時刻」と一緒に覚え、時刻が進んだら（返信を送って作業が始まった = 状態が変わった）覚えは効かない。
 * 画面に開き直したとき（useMarkSeen）と、手で既読にしたときに外す
 */
export function createReadHolds() {
  const held = new Map<number, string>();
  return {
    hold: (chat: Pick<Chat, "id" | "active_at">) => void held.set(chat.id, chat.active_at),
    release: (chatId: number) => void held.delete(chatId),
    isHeld: (chat: Pick<Chat, "id" | "active_at">): boolean => held.get(chat.id) === chat.active_at,
  };
}

/** このウィンドウの覚え（右クリック・⌘⇧U・サイドバーのどこで未読にしても、見ている画面が同じものを読む） */
export const readHolds = createReadHolds();
