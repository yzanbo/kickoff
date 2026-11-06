import { createContext, useContext } from "react";

/**
 * 右の欄・別ウィンドウ（サブエージェント・変更・ファイル・メモ・子チャット）の中で、「メインのチャット」（その右の欄を持つチャット・別ウィンドウを開いたチャット）の ID。
 * 中の右クリックの「メインのチャット」の組と、文を選んだときの「チャットに追加」の足す先。メインの会話の中・ほかの画面では null
 */
export const MainChatContext = createContext<number | null>(null);

export const useMainChat = (): number | null => useContext(MainChatContext);
