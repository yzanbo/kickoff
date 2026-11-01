import { Globe, Maximize2, Minimize2, PanelRightClose, PanelRightOpen, Plus, SquarePen, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { BoardStage, Phase, ProjectSummary, Run } from "../../../core/types";
import { RunPage } from "../pages/RunPage";
import { SECTION_META } from "../sections";
import { normalizeUrl } from "../url";
import { BrowserPane } from "./BrowserPane";
import { NewChatPane } from "./NewChatPane";

/** 新しいチャットを始めるときの指定（どのプロジェクト・セクション・列・グループで始めるか） */
export interface NewChatTarget {
  projectId: number;
  section?: Phase;
  stage?: BoardStage;
  group?: number;
}

/** 右側のパネルのタブ（チャット・新しいチャット・ブラウザ） */
type PanelTab =
  | { key: string; kind: "chat"; id: number; projectId: number; focus?: number }
  /** groupName: タブに出す作成先のグループ名（パネルの中で分かりしだい入れる） */
  | ({ key: string; kind: "new"; groupName?: string } & NewChatTarget)
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
const PANEL_MAX_KEY = "kickoff:panel-maximized";
const DEFAULT_PANEL_WIDTH = 560;
const MIN_PANEL_WIDTH = 360;

interface Options {
  /** ボードに出ているチャット（削除・アーカイブされたチャットのタブを閉じるのに使う） */
  runs: Run[];
  loaded: boolean;
  /** true の間は Esc でパネルを閉じない（メニューが開いているときなど） */
  holdEsc?: boolean;
  /** 全プロジェクトのボードでは、新しいチャットのプロジェクトを選べるようにする */
  projects?: ProjectSummary[];
  /** 新しいチャットができたとき（URL をそのチャットにするなど） */
  onCreated?: (run: Run) => void;
}

/**
 * ボードの右側から出てくるパネル（チャット・ブラウザのタブ）。カンバンとグループのボードで共通。
 * body はボードとパネルを並べる要素に渡し、renderPanel() をその中の最後に置く。
 */
export function useSidePanel({ runs, loaded, holdEsc = false, projects, onCreated }: Options) {
  // パネルを閉じてもタブは残し、次に開いたときに戻す
  const [tabs, setTabs] = useState<PanelTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(() => Number(localStorage.getItem(PANEL_WIDTH_KEY)) || DEFAULT_PANEL_WIDTH);
  const [resizing, setResizing] = useState(false);
  // 横幅いっぱい（ボードを覆う）。戻すと、元の幅に戻る
  const [maximized, setMaximized] = useState(() => localStorage.getItem(PANEL_MAX_KEY) === "1");
  const toggleMaximized = () => {
    localStorage.setItem(PANEL_MAX_KEY, maximized ? "0" : "1");
    setMaximized(!maximized);
  };
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

  /**
   * 新しいチャットのタブを開く（ボードや列・グループの＋、サイドバーの＋など）。
   * 同じ指定のまだ送っていないタブがあれば、それを表示する
   */
  const openNew = (target: NewChatTarget) => {
    // 指定ごとに決まったキーにして、続けて呼ばれても（開発時の二重実行でも）1 つにまとめる
    const key = `new:${target.projectId}:${target.section ?? ""}:${target.stage ?? ""}:${target.group ?? ""}`;
    setTabs((prev) => (prev.some((t) => t.key === key) ? prev : [...prev, { key, kind: "new", ...target }]));
    setActiveTab(key);
    setPanelOpen(true);
  };

  /** 新しいチャットを送ったら、そのタブをできたチャットのタブに置き換える */
  const replaceWithChat = (key: string, run: Run) => {
    const chat: PanelTab = { key: chatKey(run.id), kind: "chat", id: run.id, projectId: run.project_id };
    setTabs((prev) => prev.map((t) => (t.key === key ? chat : t)));
    setActiveTab(chat.key);
    onCreated?.(run);
  };

  /** ブラウザの新しいタブを開く（空のページで、アドレス欄に入力して開く） */
  const openBrowser = () => {
    const key = `browser:${Date.now()}`;
    setTabs((prev) => [...prev, { key, kind: "browser", url: "", title: "" }]);
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
    // 横幅いっぱいのときは、今の幅からドラッグを始める（ドラッグすると横幅いっぱいは解除）
    let width = maximized ? body.clientWidth : panelWidth;
    if (maximized) {
      localStorage.setItem(PANEL_MAX_KEY, "0");
      setMaximized(false);
    }
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
    const Icon = t.kind === "browser" ? Globe : t.kind === "new" ? SquarePen : run ? SECTION_META[run.phase].icon : null;
    const label =
      t.kind === "browser" ? t.title || (t.url ? hostOf(t.url) : "新しいタブ") : t.kind === "new"
          ? t.groupName
            ? `新しいチャット · ${t.groupName}`
            : "新しいチャット"
          : run?.title || "チャット";
    return { run, Icon, label };
  };

  const renderPanel = () => (
    <aside className="board-panel" aria-hidden={!panelOpen}>
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
        <div className="panel-controls">
          {/* 横から出てきたパネルを、横へしまう（タブはそのまま残る） */}
          <button className="panel-control" title="パネルを閉じる（Esc）" aria-label="パネルを閉じる" onClick={close}>
            <PanelRightClose size={15} />
          </button>
          <button
            className="panel-control"
            title={maximized ? "元の幅に戻す" : "横幅いっぱいに広げる"}
            aria-label={maximized ? "元の幅に戻す" : "横幅いっぱいに広げる"}
            aria-pressed={maximized}
            onClick={toggleMaximized}
          >
            {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
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
            ) : t.kind === "new" ? (
              <NewChatPane
                projectId={t.projectId}
                section={t.section}
                stage={t.stage}
                group={t.group}
                projects={projects}
                onProjectChange={(projectId) =>
                  setTabs((prev) => prev.map((x) => (x.key === t.key ? { ...t, projectId, group: undefined, groupName: undefined } : x)))
                }
                onGroupChange={(group, groupName) =>
                  setTabs((prev) => prev.map((x) => (x.key === t.key && x.kind === "new" ? { ...x, group, groupName } : x)))
                }
                onClose={close}
                onCreated={(run) => replaceWithChat(t.key, run)}
              />
            ) : (
              <BrowserPane
                url={t.url}
                onChange={({ url, title }) => {
                  // 空のページのあいだは「新しいタブ」と表示する
                  if (url === "about:blank") title = "";
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
    openNew,
    openBrowser,
    /** 送る前の新しいチャットのタブ（ボードの列・グループに下書きとして出す） */
    drafts: tabs.flatMap((t) => (t.kind === "new" ? [{ key: t.key, target: { projectId: t.projectId, section: t.section, stage: t.stage, group: t.group } }] : [])),
    /** タブを表示する（下書きを押したとき） */
    showTab: reopen,
    /** タブを閉じる（下書きを削除したとき） */
    closeTab,
    isShowingTab: (key: string) => panelOpen && activeTab === key,
    /** パネルの表示中のタブがこのチャットか（カードを選択中として見せる） */
    isShowing: (runId: number) => panelOpen && activeTab === chatKey(runId),
    /** このチャットをタブで開いているか */
    hasTab: (runId: number) => tabs.some((t) => t.key === chatKey(runId)),
    /** ボードとパネルを並べる要素に渡す */
    body: {
      ref: bodyRef,
      className: `board-body ${panelOpen ? "with-panel" : ""} ${resizing ? "resizing" : ""}`,
      // 横幅いっぱいは、CSS 側の上限（ボードの幅）まで広げる
      style: { "--panel-w": maximized ? "100vw" : `${panelWidth}px` } as CSSProperties,
    },
    renderPanel,
    /** ボードの見出し（「ボード／リスト」の右）に置く、パネルの開閉ボタン。閉じていて開いたタブがあれば数を出す */
    toggleButton: (
      <button
        className={`icon-button panel-toggle ${panelOpen ? "active" : ""}`}
        title={panelOpen ? "右側のパネルを閉じる（Esc）" : "右側のパネルを開く"}
        aria-label={panelOpen ? "右側のパネルを閉じる" : "右側のパネルを開く"}
        aria-pressed={panelOpen}
        onClick={() => (panelOpen ? close() : reopen())}
      >
        {panelOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
        {!panelOpen && tabs.length > 0 && <span className="panel-toggle-count">{tabs.length}</span>}
      </button>
    ),
  };
}

/**
 * 送る前の新しいチャット（パネルで入力中）の下書き。押すとそのタブを表示し、右クリックで開く・削除を選べる
 */
export function DraftCard({ active, onOpen, onDelete }: { active: boolean; onOpen: () => void; onDelete: () => void }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        setMenu(null);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [menu]);

  return (
    <>
      <button
        type="button"
        className={`draft-card ${active ? "selected" : ""}`}
        title="右側で入力中の新しいチャット（右クリックで削除）"
        onClick={onOpen}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: Math.min(e.clientX, window.innerWidth - 220), y: Math.min(e.clientY, window.innerHeight - 120) });
        }}
      >
        <SquarePen size={14} aria-hidden />
        新しいチャット（入力中）
      </button>
      {menu && (
        <div ref={menuRef} className="menu" style={{ left: menu.x, top: menu.y }} role="menu">
          <button role="menuitem" onClick={() => (onOpen(), setMenu(null))}>
            <SquarePen size={14} /> 開く
          </button>
          <button role="menuitem" className="danger" onClick={() => (onDelete(), setMenu(null))}>
            <Trash2 size={14} /> 削除（入力中の内容は消えます）
          </button>
        </div>
      )}
    </>
  );
}
