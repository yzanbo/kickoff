import { createContext, useMemo } from "react";
import type { BackgroundState } from "@shared/types";
import { backgroundCallIds } from "./toolStatus";

const NONE: ReadonlySet<string> = new Set();

/**
 * 裏でまだ動いている作業を起動した呼び出しの ID（流れのツールのまとまりが、裏で動かしたコマンドを終わるまで実行中として見せる）。
 * チャットの画面（ChatView）と別ウィンドウのサブエージェントの画面が配る
 */
export const BackgroundCallsContext = createContext<ReadonlySet<string>>(NONE);

/** 配る値を作る（中身が同じなら同じ Set を返し、memo したツールのまとまりを描き直させない） */
export function useBackgroundCalls(background: BackgroundState | null): ReadonlySet<string> {
  const key = backgroundCallIds(background).join(" ");
  return useMemo(() => (key ? new Set(key.split(" ")) : NONE), [key]);
}
