import type { WebviewTag } from "electron";
import { ArrowLeft, ArrowRight, ChevronDown, ExternalLink, Globe, RotateCw, Wrench, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { cx } from "@/lib/cx";
import { useExternalBrowser } from "@/features/openWith/externalApps";
import { normalizeUrl } from "@/lib/url";
import { IconButton } from "@/ui/IconButton";
import { useContextMenu } from "@/ui/useContextMenu";
import { DockMenu } from "./DockMenu";
import { DEVTOOLS_DOCK_LABELS, useDevtools } from "./useDevtools";

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
  // 外のブラウザ（パネルのブラウザの ▾ で選ぶ。初めは Chrome）
  const external = useExternalBrowser();
  const [loading, setLoading] = useState(false);
  const [nav, setNav] = useState({ back: false, forward: false });
  const [error, setError] = useState<string>();
  // 開発者ツール（右・下・別のウィンドウ）と、出す場所を選ぶメニュー
  const devtools = useDevtools(ref);
  const dockMenu = useContextMenu({ align: "end" });
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

  const devtoolsShown = devtools.shown !== null;

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
        {/* 開発者ツール（右・下・別のウィンドウ。React DevTools など、入れた拡張機能も使える）と、出す場所 */}
        <span className="browser-devtools-buttons">
          <IconButton
            icon={Wrench}
            label={devtoolsShown ? "開発者ツールを閉じる" : "開発者ツールを開く"}
            title={devtoolsShown ? "開発者ツールを閉じる" : `開発者ツールを開く（${DEVTOOLS_DOCK_LABELS[devtools.dock]}）`}
            size={14}
            type="button"
            aria-pressed={devtoolsShown}
            className={devtoolsShown ? "active" : undefined}
            onClick={devtools.toggle}
          />
          <IconButton
            icon={ChevronDown}
            label="開発者ツールの場所"
            size={12}
            type="button"
            className="browser-devtools-dock"
            aria-haspopup="menu"
            aria-expanded={dockMenu.isOpen}
            onClick={dockMenu.toggle}
          />
        </span>
        <IconButton
          icon={ExternalLink}
          label={`${external.label}で開く`}
          title={`${external.label}で開く（ログインが必要なページや Bitwarden を使うとき。アプリはパネルのブラウザの ▾ で選べます）`}
          type="button"
          onClick={() => external.open(current)}
        />
      </form>
      {dockMenu.menu && <DockMenu at={dockMenu.menu.at} value={devtools.dock} onPick={devtools.changeDock} onClose={dockMenu.close} />}
      {error && <p className="browser-error">{error}</p>}
      <div className={cx("browser-body", devtools.embed && `dock-${devtools.embed.dock}`, devtools.resizing && "resizing")}>
        {/* partition は main プロセスでも専用のセッションに強制している */}
        <webview ref={ref} className="browser-view" src={normalizeUrl(initialUrl)} partition="persist:kickoff-browser" />
        {/* 右と下で同じ要素を使い、並べ方と大きさだけを変える（場所を変えても開発者ツールを開き直さない） */}
        {devtools.embed && (
          <>
            {devtools.embed.dock === "right" ? (
              <div className="pane-resizer" aria-label="開発者ツールの幅を変える" {...devtools.width.handle} />
            ) : (
              <div
                className="browser-devtools-resizer"
                role="separator"
                aria-orientation="horizontal"
                aria-label="開発者ツールの高さを変える"
                title="ドラッグで高さを変える（ダブルクリックで元に戻す）"
                onPointerDown={devtools.startResizeHeight}
                onDoubleClick={devtools.resetHeight}
              />
            )}
            <div
              ref={devtools.width.paneRef as React.RefObject<HTMLDivElement>}
              className="browser-devtools"
              style={devtools.embed.dock === "right" ? { width: devtools.width.width } : { height: devtools.height }}
            >
              <webview key={devtools.embed.key} ref={devtools.devtoolsRef} className="browser-devtools-view" src="about:blank" partition="persist:kickoff-browser" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
