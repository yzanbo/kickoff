// AI（チャットのエージェント）が操作しているブラウザのタブ（タブのキー）。メインプロセスの知らせ（agentBrowser.onActivity）で変わり、
// タブに「AI 操作中」の印を出し、表に出ていないタブも見えない形で並べる（撮る・押すため。styles/browser/browser.css）
import type { WebviewTag } from "electron";
import { useEffect, useSyncExternalStore, type RefObject } from "react";

const active = new Set<string>();
const listeners = new Set<() => void>();

/** AI がこのタブを操作している・しばらく操作していない */
export function setAgentBrowsing(tabKey: string, on: boolean) {
  if (active.has(tabKey) === on) return;
  if (on) active.add(tabKey);
  else active.delete(tabKey);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** AI がこのタブを操作しているか（タブのキーがなければ false） */
export function useAgentBrowsing(tabKey: string | null): boolean {
  return useSyncExternalStore(subscribe, () => tabKey !== null && active.has(tabKey));
}

/** ブラウザのタブの webview を、準備ができたら AI の操作先としてメインプロセスに登録する（外したら・タブを閉じたら外す） */
export function useAgentRegistration(viewRef: RefObject<WebviewTag | null>, tabKey: string | null, projectId: number | null) {
  useEffect(() => {
    const view = viewRef.current;
    const api = window.kickoff?.agentBrowser;
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
