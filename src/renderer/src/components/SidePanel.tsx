import { Globe, PanelRightClose, PanelRightOpen, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { Run } from "../../../core/types";
import { RunPage } from "../pages/RunPage";
import { SECTION_META } from "../sections";
import { normalizeUrl } from "../url";
import { BrowserPane } from "./BrowserPane";

/** 右側のパネルのタブ（チャット、またはブラウザ） */
type PanelTab =
  | { key: string; kind: "chat"; id: number; projectId: number; focus?: number }
  | { key: string; kind: "browser"; url: string; title: string };

const chatKey = (id: number) => `chat:${id}`;

function hostOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).host || url;
  } catch {
    return url;
  }
}

const PANEL_WIDTH_KEY = "kickoff:panel-width";
const DEFAULT_PANEL_WIDTH = 560;
const MIN_PANEL_WIDTH = 360;

interface Options {
  /** ボードに出ているチャット（削除・アーカイブされたチャットのタブを閉じるのに使う） */
  runs: Run[];
  loaded: boolean;
  /** ブラウザで前回見ていた URL を覚えておく単位（ボードごと） */
  scope: string;
  /** true の間は Esc でパネルを閉じない（メニューが開いているときなど） */
  holdEsc?: boolean;
}

/**
 * ボードの右側から出てくるパネル（チャット・ブラウザのタブ）。カンバンとグループのボードで共通。
 * body はボードとパネルを並べる要素に渡し、renderPanel() をその中の最後に置く。
 */
export function useSidePanel({ runs, loaded, scope, holdEsc = false }: Options) {
  // パネルを閉じてもタブは残し、次に開いたときに戻す
  const [tabs, setTabs] = useState<PanelTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(() => Number(localStorage.getItem(PANEL_WIDTH_KEY)) || DEFAULT_PANEL_WIDTH);
  const [resizing, setResizing] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  /**
   * 右側のパネルにタブで開く（開いていればそのタブへ）。ボードはその分狭くなる。
   * focus は検索結果から開いたときに、スクロールして強調する発言
   */
  const open = (run: Pick<Run, "id" | "project_id">, focus?: number) => {
    const key = chatKey(run.id);
    const tab: PanelTab = { key, kind: "chat", id: run.id, projectId: run.project_id, focus };
    setTabs((prev) => (prev.some((t) => t.key === key) ? prev.map((t) => (t.key === key && focus ? tab : t)) : [...prev, tab]));
    setActiveTab(key);
    setPanelOpen(true);
  };

  /** ブラウザのタブを開く（前回このボードで見ていた URL から） */
  const urlKey = `kickoff:browser-url:${scope}`;
  const openBrowser = () => {
    const key = `browser:${Date.now()}`;
    const url = localStorage.getItem(urlKey) || "localhost:3000";
    setTabs((prev) => [...prev, { key, kind: "browser", url, title: "" }]);
    setActiveTab(key);
    setPanelOpen(true);
  };
  const close = () => setPanelOpen(false);
  const reopen = (key?: string) => {
    if (key) setActiveTab(key);
    setPanelOpen(true);
  };

  /** タブを閉じる。表示中のタブなら隣のタブへ、最後のタブならパネルも閉じる */
  const closeTab = (key: string) => {
    setTabs((prev) => {
      const index = prev.findIndex((t) => t.key === key);
      const next = prev.filter((t) => t.key !== key);
      if (activeTab === key) setActiveTab(next[Math.min(index, next.length - 1)]?.key ?? null);
      if (next.length === 0) setPanelOpen(false);
      return next;
    });
  };

  // 削除・アーカイブされたチャットのタブは閉じる
  useEffect(() => {
    const gone = tabs.filter((t) => t.kind === "chat" && !runs.some((r) => r.id === t.id));
    if (loaded && gone.length > 0) gone.forEach((t) => closeTab(t.key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, loaded]);

  /** パネルの左端をドラッグして幅を変える（ボードを覆うところまで広げられる） */
  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const body = bodyRef.current;
    if (!body) return;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    setResizing(true);
    const right = body.getBoundingClientRect().right;
    const max = body.clientWidth;
    let width = panelWidth;
    const onMove = (ev: PointerEvent) => {
      width = Math.round(Math.max(MIN_PANEL_WIDTH, Math.min(max, right - ev.clientX)));
      body.style.setProperty("--panel-w", `${width}px`);
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      setResizing(false);
      setPanelWidth(width);
      localStorage.setItem(PANEL_WIDTH_KEY, String(width));
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  };

  // Esc でパネルを閉じる（メニューやダイアログが開いていればそちらを優先）
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !holdEsc && !document.querySelector("dialog[open]")) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, holdEsc]);

  const tabLabel = (t: PanelTab) => {
    const run = t.kind === "chat" ? runs.find((r) => r.id === t.id) : undefined;
    const Icon = t.kind === "browser" ? Globe : run ? SECTION_META[run.phase].icon : null;
    const label = t.kind === "browser" ? t.title || hostOf(t.url) : run?.title || "チャット";
    return { run, Icon, label };
  };

  // 閉じているときは、右端に細い帯を残して、そこから開き直せるようにする
  const rail = !panelOpen;

  const renderPanel = () => (
    <aside className={`board-panel ${rail ? "rail" : ""}`}>
      {rail && (
        <div className="panel-rail">
          <button className="panel-rail-button" title="パネルを開く" aria-label="パネルを開く" onClick={() => reopen()}>
            <PanelRightOpen size={15} />
          </button>
          {tabs.map((t) => {
            const { run, Icon, label } = tabLabel(t);
            return (
              <button
                key={t.key}
                className={`panel-rail-button ${activeTab === t.key ? "active" : ""}`}
                title={label}
                aria-label={`${label} を開く`}
                onClick={() => reopen(t.key)}
              >
                {Icon && <Icon size={14} className={run ? `sec-icon sec-${run.phase}` : undefined} aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
      <div
        inert={!panelOpen}
        className="panel-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="パネルの幅を変える"
        title="ドラッグで幅を変える"
        onPointerDown={startResize}
      />
      <div className="panel-tabs" role="tablist" inert={!panelOpen}>
        {/* 横から出てきたパネルを、横へしまう（タブはそのまま残る） */}
        <button className="panel-collapse" title="パネルを閉じる（Esc）" aria-label="パネルを閉じる" onClick={close}>
          <PanelRightClose size={15} />
        </button>
        {tabs.map((t) => {
          const { run, Icon, label } = tabLabel(t);
          return (
            <div key={t.key} className={`panel-tab ${activeTab === t.key ? "active" : ""}`} role="tab" aria-selected={activeTab === t.key}>
              <button className="panel-tab-label" onClick={() => setActiveTab(t.key)} title={t.kind === "browser" ? t.url : run?.title}>
                {Icon && <Icon size={12} className={run ? `sec-icon sec-${run.phase}` : "muted"} aria-hidden />}
                <span>{label}</span>
              </button>
              <button className="panel-tab-close" aria-label={`${label} のタブを閉じる`} onClick={() => closeTab(t.key)}>
                <X size={12} />
              </button>
            </div>
          );
        })}
        <button className="panel-tab-add" title="ブラウザのタブを開く" aria-label="ブラウザのタブを開く" onClick={openBrowser}>
          <Plus size={12} />
          <Globe size={12} />
        </button>
      </div>
      <div className="panel-content" inert={!panelOpen}>
        {tabs.length === 0 && (
          <div className="panel-empty">
            <p className="muted small">カードを押すと、ここにチャットが開きます。</p>
            <button className="btn" onClick={openBrowser}>
              <Globe size={14} /> ブラウザを開く
            </button>
          </div>
        )}
        {/* タブを切り替えても入力中の文章やスクロール位置が残るよう、開いているタブはすべて保持する */}
        {tabs.map((t) => (
          <div key={t.key} className="panel-tab-page" hidden={activeTab !== t.key}>
            {t.kind === "chat" ? (
              <RunPage projectId={t.projectId} runId={t.id} focus={t.focus} onClose={close} />
            ) : (
              <BrowserPane
                url={t.url}
                onChange={({ url, title }) => {
                  localStorage.setItem(urlKey, url);
                  setTabs((prev) => prev.map((x) => (x.key === t.key && x.kind === "browser" ? { ...x, title } : x)));
                }}
              />
            )}
          </div>
        ))}
      </div>
    </aside>
  );

  return {
    open,
    openBrowser,
    /** パネルの表示中のタブがこのチャットか（カードを選択中として見せる） */
    isShowing: (runId: number) => panelOpen && activeTab === chatKey(runId),
    /** このチャットをタブで開いているか */
    hasTab: (runId: number) => tabs.some((t) => t.key === chatKey(runId)),
    /** ボードとパネルを並べる要素に渡す */
    body: {
      ref: bodyRef,
      className: `board-body ${panelOpen ? "with-panel" : rail ? "with-rail" : ""} ${resizing ? "resizing" : ""}`,
      style: { "--panel-w": `${panelWidth}px` } as CSSProperties,
    },
    renderPanel,
  };
}
