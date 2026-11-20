// 入力欄のウィンドウ間の知らせ（WindowMessageMap に足す。受けるのはメインのウィンドウのチャットの画面 @/features/chat/ui/screen/chatScreens.ts）
import type { Attachment } from "@shared/chat/types";

declare module "@/foundation/ui/navigation/windowBus" {
  interface WindowMessageMap {
    /** メインのウィンドウのそのチャットのチャット欄の後ろに足す（別ウィンドウの差分の行・返答へのコメント・ノートの添付） */
    fillComposer: { chatId: number; text: string; attachments?: Attachment[] };
  }
}
