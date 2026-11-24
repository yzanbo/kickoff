// 裏でまだ動いている作業の取り出し口
import type { BackgroundState } from "@shared/ai/turnEvents";
import { defineChatSelector, memoLast, type ChatSource } from "@/features/chat/ui";

const NO_CALLS: ReadonlySet<string> = new Set();

/** 裏でまだ動いている作業を起動した呼び出しの ID（裏で動かしたコマンドを、終わるまで流れの中でも実行中として見せる） */
export function backgroundCallIds(background: BackgroundState | null): string[] {
  return (background?.tasks ?? []).flatMap((t) => (t.tool_use_id ? [t.tool_use_id] : []));
}

/** 1 つのチャットの計算（中身が同じなら同じ Set） */
export function createBackgroundCalls(): (src: ChatSource, chatId: number) => ReadonlySet<string> {
  let calls: { key: string; set: ReadonlySet<string> } = { key: "", set: NO_CALLS };
  const of = memoLast((state: BackgroundState | null): ReadonlySet<string> => {
    const key = backgroundCallIds(state).join(" ");
    if (key !== calls.key) calls = { key, set: key ? new Set(key.split(" ")) : NO_CALLS };
    return calls.set;
  });
  return (src, chatId) => of(src.detail(chatId).live.background);
}

/** 裏でまだ動いている作業を起動した呼び出しの ID（中身が同じなら同じ Set。作業中の様子が替わっても） */
export const backgroundCalls = defineChatSelector(["detail"], createBackgroundCalls);
