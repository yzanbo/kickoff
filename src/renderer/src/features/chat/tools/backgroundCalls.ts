import { createContext } from "react";

const NONE: ReadonlySet<string> = new Set();

/**
 * 裏でまだ動いている作業を起動した呼び出しの ID（流れのツールのまとまりが、裏で動かしたコマンドを終わるまで実行中として見せる）。
 * 会話の欄と右の欄・別ウィンドウのサブエージェントの画面が、店の取り出し口（useChatBackgroundCalls。中身が同じなら同じ Set）から配る
 */
export const BackgroundCallsContext = createContext<ReadonlySet<string>>(NONE);
