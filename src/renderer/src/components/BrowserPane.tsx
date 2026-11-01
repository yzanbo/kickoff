import type { WebviewTag } from "electron";
import { ArrowLeft, ArrowRight, ExternalLink, Globe, RotateCw, SquareTerminal, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { normalizeUrl } from "../url";

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
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  useEffect(() => {
    const view = ref.current;
    if (!view) return;
    const sync = () => {
      const url = view.getURL();
      setCurrent(url);
      setAddress(url);
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
    return () => {
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
        <button type="button" className="icon-button" disabled={!nav.back} title="戻る" aria-label="戻る" onClick={() => ref.current?.goBack()}>
          <ArrowLeft size={15} />
        </button>
        <button type="button" className="icon-button" disabled={!nav.forward} title="進む" aria-label="進む" onClick={() => ref.current?.goForward()}>
          <ArrowRight size={15} />
        </button>
        <button
          type="button"
          className="icon-button"
          title={loading ? "読み込みを止める" : "再読み込み"}
          aria-label={loading ? "読み込みを止める" : "再読み込み"}
          onClick={() => (loading ? ref.current?.stop() : ref.current?.reload())}
        >
          {loading ? <X size={15} /> : <RotateCw size={14} />}
        </button>
        <input
          className="browser-address"
          aria-label="URL"
          value={address}
          spellCheck={false}
          placeholder="localhost:3000 や URL を入力"
          onChange={(e) => setAddress(e.target.value)}
          onFocus={(e) => e.target.select()}
        />
        <button
          type="button"
          className="icon-button"
          title="開発者ツール（React DevTools など）"
          aria-label="開発者ツールを開く"
          onClick={() => (ref.current?.isDevToolsOpened() ? ref.current.closeDevTools() : ref.current?.openDevTools())}
        >
          <SquareTerminal size={15} />
        </button>
        <button
          type="button"
          className="icon-button"
          title="Chrome で開く（ログインが必要なページや Bitwarden を使うとき）"
          aria-label="Chrome で開く"
          onClick={() => void window.kickoff?.openInChrome(current)}
        >
          <ExternalLink size={14} />
        </button>
      </form>
      {error && <p className="browser-error">{error}</p>}
      {/* partition は main プロセスでも専用のセッションに強制している */}
      <webview ref={ref} className="browser-view" src={normalizeUrl(initialUrl)} partition="persist:kickoff-browser" />
    </div>
  );
}
