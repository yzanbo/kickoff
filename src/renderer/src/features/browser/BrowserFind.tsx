import type { WebviewTag } from "electron";
import { useCallback, useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";
import { FindField, findCountText } from "@/ui/FindField";
import { registerPageFind } from "@/ui/pageFind";

/** ページの外の ⌘F はアプリ全体の検索から、webview の中ではメインプロセスから受け取る */
export function useBrowserFind({ paneRef, view, visible, tabKey }: {
  paneRef: RefObject<HTMLDivElement | null>;
  view: WebviewTag | null;
  visible: boolean;
  tabKey: string | null;
}) {
  const [focusSignal, setFocusSignal] = useState(0);
  const open = useCallback(() => setFocusSignal((n) => n + 1), []);

  useEffect(() => {
    if (!visible) {
      setFocusSignal(0);
      return;
    }
    const pane = paneRef.current;
    const api = window.kickoff;
    if (!pane || !view || !api) return;
    // タブの名前のボタンにピントがあるときも、そのタブのブラウザで開く
    const unregister = registerPageFind(pane, open, (target) =>
      tabKey !== null && target.closest<HTMLElement>(".panel-tab.active[data-browser-tab-key]")?.dataset.browserTabKey === tabKey,
    );
    const off = api.browser.onFindRequested((id) => {
      if (!pane.checkVisibility() || pane.closest("[inert]")) return;
      try {
        if (view.getWebContentsId() === id) open();
      } catch {
        // webview はまだ準備中、または閉じた直後
      }
    });
    return () => {
      unregister();
      off();
    };
  }, [paneRef, view, visible, tabKey, open]);

  const field = visible && view && focusSignal > 0 ? (
    <BrowserFindField
      view={view}
      focusSignal={focusSignal}
      onClose={() => {
        setFocusSignal(0);
        view.focus();
      }}
    />
  ) : null;
  return { open, field };
}

/** ページの DOM は外の画面から読まず、Chromium のページ内検索に任せる */
function BrowserFindField({ view, focusSignal, onClose }: { view: WebviewTag; focusSignal: number; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef<number | null>(null);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Electron.FoundInPageResult | null>(null);

  // 検索を閉じたあとに遅れて届いた知らせも無視する
  const clear = useCallback(() => {
    const searching = requestId.current !== null;
    requestId.current = null;
    if (searching && view.isConnected) view.stopFindInPage("clearSelection");
  }, [view]);
  const search = (text: string, newSession: boolean, forward = true) => {
    try {
      // Electron の findNext は、名前に反して「新しい検索を始める」の指定
      requestId.current = view.findInPage(text, { findNext: newSession, forward });
    } catch {
      // 準備前に入力した文は dom-ready で探し直す
      requestId.current = null;
    }
  };
  const searchLoadedPage = useEffectEvent(() => {
    if (query) search(query, true);
  });

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusSignal]);

  useEffect(() => {
    const found = ({ result }: Electron.FoundInPageEvent) => {
      if (result.requestId === requestId.current && result.finalUpdate) setResult(result);
    };
    const reset = () => {
      requestId.current = null;
      setResult(null);
    };
    const loaded = () => searchLoadedPage();
    view.addEventListener("found-in-page", found);
    view.addEventListener("did-navigate", reset);
    view.addEventListener("dom-ready", loaded);
    return () => {
      view.removeEventListener("found-in-page", found);
      view.removeEventListener("did-navigate", reset);
      view.removeEventListener("dom-ready", loaded);
      clear();
    };
  }, [view, clear]);

  return (
    <FindField
      className="browser-find"
      inputRef={inputRef}
      value={query}
      onChange={(text) => {
        setQuery(text);
        setResult(null);
        if (text) search(text, true);
        else clear();
      }}
      placeholder="このページを検索"
      invalid={false}
      count={result ? findCountText({
        invalid: false, query, total: result.matches, current: result.activeMatchOrdinal > 0 ? result.activeMatchOrdinal - 1 : null,
      }) : ""}
      canStep={(result?.matches ?? 0) > 0}
      onStep={(step) => {
        if (result && result.matches > 0) search(query, false, step > 0);
      }}
      onClose={onClose}
    />
  );
}
