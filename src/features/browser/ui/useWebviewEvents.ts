// webview のイベントの付け外し（BrowserPane。付けるのは部品を作ったときに 1 回、外すのは部品を外したとき）
import type { WebviewTag } from "electron";
import { useEffect, useEffectEvent, type RefObject } from "react";

/** 受けるイベント（読み込みの始まり・終わり・移動・題・失敗） */
export interface WebviewEvents {
  "did-start-loading"?: () => void;
  "did-stop-loading"?: () => void;
  "did-navigate"?: () => void;
  "did-navigate-in-page"?: () => void;
  "page-title-updated"?: () => void;
  "did-fail-load"?: (e: Electron.DidFailLoadEvent) => void;
}

/** ref の webview に、handlersOf(view) のイベントを付ける（handlersOf は付けるときのいまの値を読む） */
export function useWebviewEvents(ref: RefObject<WebviewTag | null>, handlersOf: (view: WebviewTag) => WebviewEvents) {
  const make = useEffectEvent(handlersOf);
  useEffect(() => {
    const view = ref.current;
    if (!view) return;
    const entries = Object.entries(make(view)) as [string, EventListener][];
    for (const [name, fn] of entries) view.addEventListener(name, fn);
    return () => {
      for (const [name, fn] of entries) view.removeEventListener(name, fn);
    };
  }, [ref]);
}
