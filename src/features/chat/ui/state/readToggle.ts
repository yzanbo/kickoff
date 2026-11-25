import type { ReadToggle } from "@shared/chat/readTiming";
import type { Chat } from "@shared/chat/types";
import { chatsApi } from "@/features/chat/ui/api/chats";
import { readHolds } from "./readHolds";

/** 既読⇔未読の切り替えのキー（⌘⇧U。チャットの画面で、一番下にいるかによらず効く） */
export const READ_TOGGLE_KEY = "mod+shift+u";

/**
 * 手で既読にする・未読にする（右クリック・⌘⇧U・既読ボタン）。未読にしたら覚え（見ている画面が既読に戻さない）、既読にしたら外す。
 * 既読は記録の ID を渡さず、そのまま消す（自分で選んだ操作なので、まだ一番下まで見ていなくても既読にする）
 */
export async function setChatRead(chat: Pick<Chat, "id" | "active_at">, toggle: ReadToggle): Promise<unknown> {
  if (toggle === "seen") {
    readHolds.release(chat.id);
    return chatsApi.markSeen(chat.id);
  }
  // 返事を待たずに覚える（未読の知らせより先に、押した直後の操作で既読に戻さない）
  readHolds.hold(chat);
  return chatsApi.markUnseen(chat.id).catch((e: unknown) => {
    readHolds.release(chat.id);
    throw e;
  });
}
