// 入力欄のウィンドウ間の知らせ（WindowMessageMap に足す。受けるのはメインのウィンドウの appendToDraft.ts の startComposerDrafts）
import type { Attachment } from "@shared/chat/types";

declare module "@/foundation/ui/navigation/windowBus" {
  interface WindowMessageMap {
    /** メインのウィンドウのそのチャットの下書きの後ろに足す（別ウィンドウの差分の行・返答へのコメント・ノートの添付） */
    appendToDraft: { chatId: number; text: string; attachments?: Attachment[] };
  }
}
