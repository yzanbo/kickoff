import type { WebviewTag } from "electron";
import { ArrowLeft, ArrowRight, ChevronDown, ExternalLink, Globe, RefreshCw, Wrench, X } from "lucide-react";
import { useCallback, useEffectEvent, useRef, useState, type FormEvent } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { useExternalBrowser } from "@/foundation/ui/external/externalApps";
import { normalizeUrl } from "@/foundation/ui/lib/url";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { HandOffButton } from "@/features/attachments/ui";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { DockMenu } from "./DockMenu";
import { DEVTOOLS_DOCK_LABELS, useDevtools } from "./useDevtools";
import { useAgentRegistration } from "./agentBrowsing";
import { browserHandOffItem } from "./browserHandOff";
import { useBrowserFind } from "./BrowserFind";
import { BrowserPageMenu, useBrowserPageMenu } from "./BrowserPageMenu";
import { useBrowserTextMenu } from "./useBrowserTextMenu";
import { isDesktopApp } from "./native";
import { useWebviewEvents } from "./useWebviewEvents";

interface Props {
  url: string;
  /** パネルが開いていて、このタブを表示しているか */
  visible: boolean;
  /** 右クリックで開く新しいタブを、このブラウザと同じ欄に足す */
  onOpenTab: (url: string, background: boolean) => void;
  /** ページのタイトル・URL が変わったとき（タブの表示と、次回の初期 URL の保存に使う） */
  onChange?: (info: { url: string; title: string }) => void;
  /** AI に操作させるときの登録先（パネルのタブのキーと、どのプロジェクトの欄か） */
  agentTarget?: { tabKey: string; projectId: number | null };
}

/**
 * 埋め込みブラウザ（開発中のアプリのプレビュー・ドキュメント閲覧）。
 * デスクトップアプリでのみ動く。表示するページは Kickoff 本体と切り離した専用のセッションで開く。
 */
export function BrowserPane({ url, onChange, agentTarget, visible, onOpenTab }: Props) {
  // 作り直したときは最後のページから。以降の移動は webview に任せ、src を更新して二重に読み込まない
  const [initialUrl] = useState(url);
  const paneRef = useRef<HTMLDivElement>(null);
  const ref = useRef<WebviewTag | null>(null);
  // 「AI に渡す」が押したときに読む webview（描く中で ref を読む関数を作らないよう、state にも持つ）
  const [view, setView] = useState<WebviewTag | null>(null);
  const attachView = useCallback((el: WebviewTag | null) => {
    ref.current = el;
    setView(el);
  }, []);
  const [address, setAddress] = useState(initialUrl === "about:blank" ? "" : initialUrl);
  const [current, setCurrent] = useState(initialUrl);
  // 外のブラウザ（パネルのブラウザの ▾ で選ぶ。初めは Chrome）
  const external = useExternalBrowser();
  const [loading, setLoading] = useState(false);
  const [nav, setNav] = useState({ back: false, forward: false });
  const [error, setError] = useState<string>();
  // 開発者ツール（右・下・別のウィンドウ）と、出す場所を選ぶメニュー
  const { paneRef: devtoolsPaneRef, slotRef: devtoolsSlotRef, ...devtools } = useDevtools(ref, visible);
  const dockMenu = useContextMenu({ align: "end" });
  const find = useBrowserFind({ paneRef, view, visible, tabKey: agentTarget?.tabKey ?? null });
  const pageMenu = useBrowserPageMenu(view, visible);
  const textMenu = useBrowserTextMenu(visible);
  const notifyChange = useEffectEvent((page: { url: string; title: string }) => onChange?.(page));

  // ページの移動・題・読み込みの様子をアドレス欄・戻る進む・タブの表示に写す
  useWebviewEvents(ref, (view) => {
    const sync = () => {
      const url = view.getURL();
      if (!url) return;
      setCurrent(url);
      // 空のページでは、アドレス欄も空のままにする
      setAddress(url === "about:blank" ? "" : url);
      setNav({ back: view.canGoBack(), forward: view.canGoForward() });
      notifyChange({ url, title: view.getTitle() });
    };
    return {
      "did-start-loading": () => {
        setLoading(true);
        setError(undefined);
      },
      "did-stop-loading": () => {
        setLoading(false);
        sync();
      },
      "did-navigate": sync,
      "did-navigate-in-page": sync,
      "page-title-updated": sync,
      // -3 は読み込みの中断（別のページへ移った）なのでエラーにしない
      "did-fail-load": (e) => {
        if (e.isMainFrame && e.errorCode !== -3) setError(`${e.errorDescription}（${e.validatedURL}）`);
      },
    };
  });

  // AI に操作させるため、準備ができたら webview をメインプロセスに登録する（閉じたら外す）
  useAgentRegistration(ref, agentTarget?.tabKey ?? null, agentTarget?.projectId ?? null);

  if (!isDesktopApp()) {
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
  // 「AI に渡す」（プロジェクトの欄のタブだけ。渡し先のチャットはそのプロジェクトのもの）
  const projectId = agentTarget?.projectId ?? null;
  const handOff =
    projectId === null
      ? null
      : browserHandOffItem(
          projectId,
          () => {
            if (!view) return null;
            try {
              return view.getWebContentsId();
            } catch {
              // 読み込みの準備ができる前は ID がない
              return null;
            }
          },
          () => ({ url: view?.getURL() ?? current, title: view?.getTitle() ?? "" }),
        );

  function go(e: FormEvent) {
    e.preventDefault();
    const next = normalizeUrl(address);
    setAddress(next);
    void ref.current?.loadURL(next).catch(() => {});
  }

  return (
    <div ref={paneRef} className="browser-pane" onContextMenu={textMenu.onContextMenu}>
      <form className="browser-toolbar bar" onSubmit={go}>
        <IconButton icon={ArrowLeft} label="戻る" iconSize={15} type="button" disabled={!nav.back} onClick={() => ref.current?.goBack()} />
        <IconButton icon={ArrowRight} label="進む" iconSize={15} type="button" disabled={!nav.forward} onClick={() => ref.current?.goForward()} />
        <IconButton
          type="button"
          icon={loading ? X : RefreshCw}
          iconSize={loading ? 15 : 14}
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
            iconSize={14}
            type="button"
            aria-pressed={devtoolsShown}
            active={devtoolsShown}
            onClick={devtools.toggle}
          />
          <IconButton
            icon={ChevronDown}
            label="開発者ツールの場所"
            iconSize={12}
            type="button"
            className="browser-devtools-dock"
            aria-haspopup="menu"
            aria-expanded={dockMenu.isOpen}
            onClick={dockMenu.toggle}
          />
        </span>
        {handOff && <HandOffButton item={handOff} className="browser-hand-off" />}
        <IconButton
          icon={ExternalLink}
          label={`${external.label}で開く`}
          title={`${external.label}で開く（ログインが必要なページや Bitwarden を使うとき。アプリはパネルのブラウザの ▾ で選べます）`}
          type="button"
          onClick={() => external.open(current)}
        />
      </form>
      {find.field}
      {textMenu.element}
      {view && pageMenu.shown && (
        <BrowserPageMenu
          shown={pageMenu.shown}
          close={pageMenu.close}
          view={view}
          currentUrl={current}
          projectId={projectId}
          nav={nav}
          external={external}
          openTab={onOpenTab}
          openFind={find.open}
          inspect={devtools.inspect}
        />
      )}
      {dockMenu.menu && <DockMenu at={dockMenu.menu.at} value={devtools.dock} onPick={devtools.changeDock} onClose={dockMenu.close} />}
      {error && <p className="browser-error">{error}</p>}
      <div className={cx("browser-body", devtools.embed && `dock-${devtools.embed.dock}`, devtools.resizing && "resizing")}>
        {/* partition は main プロセスでも専用のセッションに強制している */}
        <webview ref={attachView} className="browser-view" src={normalizeUrl(initialUrl)} partition="persist:kickoff-browser" />
        {/* 右と下で同じ要素を使い、並べ方と大きさだけを変える（場所を変えても開発者ツールを開き直さない） */}
        {devtools.embed && (
          <>
            {devtools.embed.dock === "right" ? (
              <div className="pane-resizer" aria-label="開発者ツールの幅を変える" {...devtools.widthHandle} />
            ) : (
              <div className="pane-resizer-y" aria-label="開発者ツールの高さを変える" {...devtools.heightHandle} />
            )}
            <div
              ref={devtoolsPaneRef}
              className="browser-devtools"
              style={devtools.embed.dock === "right" ? { width: devtools.width } : { height: devtools.height }}
            >
              {/* 開発者ツールはメインプロセスがこの枠に重ねて出す（webview の中には出さない）。重ねた表示を隠している間は、撮った見た目を出す */}
              <div ref={devtoolsSlotRef} className="browser-devtools-view">
                {devtools.snapshot && <img className="browser-devtools-snapshot" src={devtools.snapshot.src} style={{ width: devtools.snapshot.width }} alt="" />}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
