import { NEW_CHAT_TITLE } from "@/features/chat/ui/chatTitle";

/** 表示だけの名前。手動の名前を優先し、なければ本文の空でない最初の行を使う。 */
export function draftDisplayTitle(title: string | undefined, text: string | undefined): string {
  return title || text?.split(/\r\n|\r|\n/).map((line) => line.trim()).find(Boolean) || NEW_CHAT_TITLE;
}
