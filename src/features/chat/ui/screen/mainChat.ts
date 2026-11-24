import { createContext, useContext } from "react";
import { ChatScreenContext } from "./chatScreen";

/**
 * 右の欄・別ウィンドウ（サブエージェント・変更・ファイル・ノート・子チャット）の中で、「メインのチャット」（その右の欄を持つチャット・別ウィンドウを開いたチャット）の ID。
 * 中の右クリックの「メインのチャット」の組と、文を選んだときの「チャットに追加」の足す先。メインの会話の中・ほかの画面では null
 */
export const MainChatContext = createContext<number | null>(null);

/** 足す先のチャット（チャットの画面の中は置き場所の ChatHost.mainChatId、なければ外の MainChatContext） */
export function useMainChat(): number | null {
  const fromHost = useContext(ChatScreenContext)?.host.mainChatId ?? null;
  const outer = useContext(MainChatContext);
  return fromHost ?? outer;
}
