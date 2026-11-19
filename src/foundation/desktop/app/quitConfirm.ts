// 作業中のチャットがあるときに、終了してよいかを聞くダイアログの文
import { UNTITLED_CHAT_TITLE } from "@shared/types";

/** ダイアログに名前を並べるチャットの数（超えた分は「ほか n 件」） */
const LISTED_CHATS = 5;

/** 終了してよいかを聞くダイアログの見出しと本文（作業中のチャットの名前を LISTED_CHATS 件まで並べる） */
export function quitConfirmText(chats: readonly { title: string | null }[]): { message: string; detail: string } {
  const names = chats.slice(0, LISTED_CHATS).map((c) => `・${c.title?.trim() || UNTITLED_CHAT_TITLE}`);
  const rest = chats.length - LISTED_CHATS;
  return {
    message: `作業中のチャットが ${chats.length} 件あります`,
    detail: [...names, ...(rest > 0 ? [`ほか ${rest} 件`] : []), "", "終了すると作業が止まります。次に起動したときに、続けるかを聞きます。"].join("\n"),
  };
}
