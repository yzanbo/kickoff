import type { WebviewTag } from "electron";
import { ArrowLeft, ArrowRight, ExternalLink, Globe, RotateCw, Wrench, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { normalizeUrl } from "../url";
import { IconButton } from "./IconButton";

interface Props {
  url: string;
  /** ページのタイトル・URL が変わったとき（タブの表示と、次回の初期 URL の保存に使う） */
  onChange?: (info: { url: string; title: string }) => void;
}

/**
 * 埋め込みブラウザ（開発中のアプリのプレビュー・ドキュメント閲覧）。
 * デスクトップアプリでのみ動く。表示するページは Kickoff 本体と切り離した専用のセッションで開く。
 */
export function BrowserPane({ url: initialUrl, onChange }: Props) {
  const ref = useRef<WebviewTag | null>(null);
  const [address, setAddress] = useState(initialUrl);
  const [current, setCurrent] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [nav, setNav] = useState({ back: false, forward: false });
  const [error, setError] = useState<string>();
  // 開発者ツールを開いているか（別のウィンドウで開く）
  const [devtools, setDevtools] = useState(false);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  useEffect(() => {
    const view = ref.current;
    if (!view) return;
    const sync = () => {
      const url = view.getURL();
      setCurrent(url);
      // 空のページでは、アドレス欄も空のままにする
      setAddress(url === "about:blank" ? "" : url);
      setNav({ back: view.canGoBack(), forward: view.canGoForward() });
      changeRef.current?.({ url, title: view.getTitle() });
    };
    const onStart = () => {
      setLoading(true);
      setError(undefined);
    };
    const onStop = () => {
      setLoading(false);
      sync();
    };
    const onFail = (e: Electron.DidFailLoadEvent) => {
      // -3 は読み込みの中断（別のページへ移った）なのでエラーにしない
      if (e.isMainFrame && e.errorCode !== -3) setError(`${e.errorDescription}（${e.validatedURL}）`);
    };
    view.addEventListener("did-start-loading", onStart);
    view.addEventListener("did-stop-loading", onStop);
    view.addEventListener("did-navigate", sync);
    view.addEventListener("did-navigate-in-page", sync);
    view.addEventListener("page-title-updated", sync);
    view.addEventListener("did-fail-load", onFail);
    const onDevtoolsOpen = () => setDevtools(true);
    const onDevtoolsClose = () => setDevtools(false);
    view.addEventListener("devtools-opened", onDevtoolsOpen);
    view.addEventListener("devtools-closed", onDevtoolsClose);
    return () => {
      view.removeEventListener("devtools-opened", onDevtoolsOpen);
      view.removeEventListener("devtools-closed", onDevtoolsClose);
      view.removeEventListener("did-start-loading", onStart);
      view.removeEventListener("did-stop-loading", onStop);
      view.removeEventListener("did-navigate", sync);
      view.removeEventListener("did-navigate-in-page", sync);
      view.removeEventListener("page-title-updated", sync);
      view.removeEventListener("did-fail-load", onFail);
    };
  }, []);

  if (!window.kickoff) {
    return (
      <div className="browser-unavailable">
        <Globe size={22} />
        <p>ブラウザの表示はデスクトップアプリでのみ使えます。</p>
        <a className="btn" href={current} target="_blank" rel="noreferrer">
          <ExternalLink size={14} /> 新しいタブで開く
        </a>
      </div>
    );
  }

  function go(e: FormEvent) {
    e.preventDefault();
    const next = normalizeUrl(address);
    setAddress(next);
    void ref.current?.loadURL(next).catch(() => {});
  }

  return (
    <div className="browser-pane">
      <form className="browser-toolbar" onSubmit={go}>
        <IconButton icon={ArrowLeft} label="戻る" size={15} type="button" disabled={!nav.back} onClick={() => ref.current?.goBack()} />
        <IconButton icon={ArrowRight} label="進む" size={15} type="button" disabled={!nav.forward} onClick={() => ref.current?.goForward()} />
        <IconButton
          type="button"
          icon={loading ? X : RotateCw}
          size={loading ? 15 : 14}
          label={loading ? "読み込みを止める" : "再読み込み"}
          onClick={() => (loading ? ref.current?.stop() : ref.current?.reload())}
        />
        <input
          className="browser-address"
          type="text"
          aria-label="URL"
          value={address}
          spellCheck={false}
          placeholder="URL を入力、または Google で検索"
          // 新しいタブ（空のページ）は、すぐ入力できるようにする
          autoFocus={!initialUrl}
          onChange={(e) => setAddress(e.target.value)}
          onFocus={(e) => e.target.select()}
        />
        {/* 開発者ツール（別のウィンドウで開く。React DevTools など、入れた拡張機能も使える） */}
        <IconButton
          icon={Wrench}
          label={devtools ? "開発者ツールを閉じる" : "開発者ツールを開く"}
          title={devtools ? "開発者ツールを閉じる" : "開発者ツールを開く（別のウィンドウ。React DevTools なども使えます）"}
          size={14}
          type="button"
          aria-pressed={devtools}
          className={devtools ? "active" : undefined}
          onClick={() => (ref.current?.isDevToolsOpened() ? ref.current.closeDevTools() : ref.current?.openDevTools())}
        />
        <IconButton
          icon={ExternalLink}
          label="Chrome で開く"
          title="Chrome で開く（ログインが必要なページや Bitwarden を使うとき）"
          type="button"
          onClick={() => void window.kickoff?.openInChrome(current)}
        />
      </form>
      {error && <p className="browser-error">{error}</p>}
      {/* partition は main プロセスでも専用のセッションに強制している */}
      <webview ref={ref} className="browser-view" src={normalizeUrl(initialUrl)} partition="persist:kickoff-browser" />
    </div>
  );
}
