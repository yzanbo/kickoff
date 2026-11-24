// AI（チャットのエージェント）が操作しているブラウザのタブ（タブのキー）。メインプロセスの知らせ（agentBrowser.onActivity）で変わり、
// タブに「AI 操作中」の印を出し、表に出ていないタブも見えない形で並べる（撮る・押すため。panel の Panel.css）
import type { WebviewTag } from "electron";
import { useEffect, useSyncExternalStore, type RefObject } from "react";
import { createCell } from "@/foundation/ui/store";
import { nativeAgentBrowser } from "./native";

const active = createCell<ReadonlySet<string>>(new Set());

/** AI がこのタブを操作している・しばらく操作していない */
export function setAgentBrowsing(tabKey: string, on: boolean) {
  active.set((now) => {
    if (now.has(tabKey) === on) return now;
    const next = new Set(now);
    if (on) next.add(tabKey);
    else next.delete(tabKey);
    return next;
  });
}

/** 中身の枠に足すクラス（タブの種類の pageClass。AI が操作しているタブは、表に出ていなくても見えない形で並べる） */
export const agentBrowsingClass = { subscribe: active.subscribe, of: (tab: { key: string }) => (active.get().has(tab.key) ? "agent-browsing" : undefined) };

/** AI がこのタブを操作しているか（タブのキーがなければ false） */
export function useAgentBrowsing(tabKey: string | null): boolean {
  return useSyncExternalStore(active.subscribe, () => tabKey !== null && active.get().has(tabKey));
}

/** ブラウザのタブの webview を、準備ができたら AI の操作先としてメインプロセスに登録する（外したら・タブを閉じたら外す） */
export function useAgentRegistration(viewRef: RefObject<WebviewTag | null>, tabKey: string | null, projectId: number | null) {
  useEffect(() => {
    const view = viewRef.current;
    const api = nativeAgentBrowser();
    if (!view || !api || tabKey === null) return;
    let id: number | undefined;
    const register = () => {
      try {
        id = view.getWebContentsId();
      } catch {
        return;
      }
      api.register(id, tabKey, projectId);
    };
    // すでに準備ができていれば（プロジェクトを変えたなど）すぐ、まだならページの準備ができたとき
    register();
    view.addEventListener("dom-ready", register);
    return () => {
      view.removeEventListener("dom-ready", register);
      if (id !== undefined) api.unregister(id);
    };
  }, [viewRef, tabKey, projectId]);
}
