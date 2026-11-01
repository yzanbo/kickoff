import { Globe, Maximize2, Minimize2, PanelRightClose, PanelRightOpen, Plus, SquarePen, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { BoardStage, Phase, ProjectSummary, Run } from "../../../core/types";
import { cx } from "../cx";
import { startHorizontalDrag } from "../hooks/dragResize";
import { useStoredFlag, useStoredNumber } from "../hooks/useStoredState";
import { useWindowEvent } from "../hooks/useWindowEvent";
import { RunPage } from "../pages/RunPage";
import { SECTION_META } from "../sections";
import { normalizeUrl } from "../url";
import { BrowserPane } from "./BrowserPane";
import { NewChatPane } from "./NewChatPane";
import { clampToViewport, PopupMenu } from "./PopupMenu";

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

export type SidePanelController = ReturnType<typeof useSidePanel>;

/**
 * ボードの右側から出てくるパネル（チャット・新しいチャット・ブラウザのタブ）の状態と操作。カンバンとグループのボードで共通。
 * 表示は SidePanel（body の中の最後に置く）・PanelToggle（見出しの開閉ボタン）・DraftCards（列の下書き）で行う
 */
export function useSidePanel({ runs, loaded, holdEsc = false, projects, onCreated }: Options) {
  // パネルを閉じてもタブは残し、次に開いたときに戻す
  const [tabs, setTabs] = useState<PanelTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useStoredNumber(PANEL_WIDTH_KEY, DEFAULT_PANEL_WIDTH);
  const [resizing, setResizing] = useState(false);
  // 横幅いっぱい（ボードを覆う）。戻すと、元の幅に戻る
  const [maximized, setMaximized] = useStoredFlag(PANEL_MAX_KEY);
  const bodyRef = useRef<HTMLDivElement>(null);

  const show = (key: string) => {
    setActiveTab(key);
    setPanelOpen(true);
  };

  /**
   * 右側のパネルにタブで開く（開いていればそのタブへ）。ボードはその分狭くなる。
   * focus は検索結果から開いたときに、スクロールして強調する発言
   */
  const open = (run: Pick<Run, "id" | "project_id">, focus?: number) => {
    const key = chatKey(run.id);
    const tab: PanelTab = { key, kind: "chat", id: run.id, projectId: run.project_id, focus };
    setTabs((prev) => (prev.some((t) => t.key === key) ? prev.map((t) => (t.key === key && focus ? tab : t)) : [...prev, tab]));
    show(key);
  };

  /**
   * 新しいチャットのタブを開く（ボードや列・グループの＋、サイドバーの＋など）。
   * 同じ指定のまだ送っていないタブがあれば、それを表示する
   */
  const openNew = (target: NewChatTarget) => {
    // 指定ごとに決まったキーにして、続けて呼ばれても（開発時の二重実行でも）1 つにまとめる
    const key = `new:${target.projectId}:${target.section ?? ""}:${target.stage ?? ""}:${target.group ?? ""}`;
    setTabs((prev) => (prev.some((t) => t.key === key) ? prev : [...prev, { key, kind: "new", ...target }]));
    show(key);
  };

  /** ブラウザの新しいタブを開く（空のページで、アドレス欄に入力して開く） */
  const openBrowser = () => {
    const key = `browser:${Date.now()}`;
    setTabs((prev) => [...prev, { key, kind: "browser", url: "", title: "" }]);
    show(key);
  };

  /** タブの中身を変える（新しいチャットのプロジェクト・グループ、ブラウザのタイトルなど） */
  const updateTab = (key: string, update: (tab: PanelTab) => PanelTab) => setTabs((prev) => prev.map((t) => (t.key === key ? update(t) : t)));

  /** 新しいチャットを送ったら、そのタブをできたチャットのタブに置き換える */
  const replaceWithChat = (key: string, run: Run) => {
    const chat: PanelTab = { key: chatKey(run.id), kind: "chat", id: run.id, projectId: run.project_id };
    updateTab(key, () => chat);
    setActiveTab(chat.key);
    onCreated?.(run);
  };

  const close = () => setPanelOpen(false);
  const reopen = () => setPanelOpen(true);

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
    const body = bodyRef.current;
    if (!body) return;
    const right = body.getBoundingClientRect().right;
    const max = body.clientWidth;
    // 横幅いっぱいのときは、今の幅からドラッグを始める（ドラッグすると横幅いっぱいは解除）
    let width = maximized ? body.clientWidth : panelWidth;
    if (maximized) setMaximized(false);
    setResizing(true);
    startHorizontalDrag(e, {
      move: (clientX) => {
        width = Math.round(Math.max(MIN_PANEL_WIDTH, Math.min(max, right - clientX)));
        body.style.setProperty("--panel-w", `${width}px`);
      },
      end: () => {
        setResizing(false);
        setPanelWidth(width);
      },
    });
  };

  // Esc でパネルを閉じる（メニューやダイアログが開いていればそちらを優先）
  useWindowEvent(
    "keydown",
    (e) => {
      if (e.key === "Escape" && !holdEsc && !document.querySelector("dialog[open]")) close();
    },
    panelOpen,
  );

  return {
    tabs,
    activeTab,
    panelOpen,
    maximized,
    runs,
    projects,
    open,
    openNew,
    openBrowser,
    /** タブを表示する（タブ・下書きを押したとき） */
    showTab: show,
    closeTab,
    updateTab,
    replaceWithChat,
    close,
    toggle: () => (panelOpen ? close() : reopen()),
    toggleMaximized: () => setMaximized(!maximized),
    startResize,
    /** 送る前の新しいチャットのタブ（ボードの列・グループに下書きとして出す） */
    drafts: tabs.flatMap((t) => (t.kind === "new" ? [{ key: t.key, target: { projectId: t.projectId, section: t.section, stage: t.stage, group: t.group } }] : [])),
    isShowingTab: (key: string) => panelOpen && activeTab === key,
    /** パネルの表示中のタブがこのチャットか（カードを選択中として見せる） */
    isShowing: (runId: number) => panelOpen && activeTab === chatKey(runId),
    /** このチャットをタブで開いているか */
    hasTab: (runId: number) => tabs.some((t) => t.key === chatKey(runId)),
    /** ボードとパネルを並べる要素に渡す */
    body: {
      ref: bodyRef,
      className: cx("board-body", panelOpen && "with-panel", resizing && "resizing"),
      // 横幅いっぱいは、CSS 側の上限（ボードの幅）まで広げる
      style: { "--panel-w": maximized ? "100vw" : `${panelWidth}px` } as CSSProperties,
    },
  };
}

/** タブに出す名前とアイコン */
function tabLabel(t: PanelTab, runs: Run[]) {
  const run = t.kind === "chat" ? runs.find((r) => r.id === t.id) : undefined;
  const Icon = t.kind === "browser" ? Globe : t.kind === "new" ? SquarePen : run ? SECTION_META[run.phase].icon : null;
  const label =
    t.kind === "browser"
      ? t.title || (t.url ? hostOf(t.url) : "新しいタブ")
      : t.kind === "new"
        ? t.groupName
          ? `新しいチャット · ${t.groupName}`
          : "新しいチャット"
        : run?.title || "チャット";
  return { run, Icon, label };
}

/** ボードの右側のパネル（ボードとパネルを並べる要素の中の最後に置く） */
export function SidePanel({ panel }: { panel: SidePanelController }) {
  const { tabs, activeTab, panelOpen, maximized } = panel;
  return (
    <aside className="board-panel" aria-hidden={!panelOpen}>
      <div
        inert={!panelOpen}
        className="panel-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="パネルの幅を変える"
        title="ドラッグで幅を変える"
        onPointerDown={panel.startResize}
      />
      <div className="panel-tabs" role="tablist" inert={!panelOpen}>
        <div className="panel-controls">
          {/* 横から出てきたパネルを、横へしまう（タブはそのまま残る） */}
          <button className="panel-control" title="パネルを閉じる（Esc）" aria-label="パネルを閉じる" onClick={panel.close}>
            <PanelRightClose size={15} />
          </button>
          <button
            className="panel-control"
            title={maximized ? "元の幅に戻す" : "横幅いっぱいに広げる"}
            aria-label={maximized ? "元の幅に戻す" : "横幅いっぱいに広げる"}
            aria-pressed={maximized}
            onClick={panel.toggleMaximized}
          >
            {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
        {tabs.map((t) => {
          const { run, Icon, label } = tabLabel(t, panel.runs);
          return (
            <div key={t.key} className={cx("panel-tab", activeTab === t.key && "active")} role="tab" aria-selected={activeTab === t.key}>
              <button className="panel-tab-label" onClick={() => panel.showTab(t.key)} title={t.kind === "browser" ? t.url : run?.title}>
                {Icon && <Icon size={12} className={run ? `sec-icon sec-${run.phase}` : "muted"} aria-hidden />}
                <span>{label}</span>
              </button>
              <button className="panel-tab-close" aria-label={`${label} のタブを閉じる`} onClick={() => panel.closeTab(t.key)}>
                <X size={12} />
              </button>
            </div>
          );
        })}
        <button className="panel-tab-add" title="ブラウザのタブを開く" aria-label="ブラウザのタブを開く" onClick={panel.openBrowser}>
          <Plus size={12} />
          <Globe size={12} />
        </button>
      </div>
      <div className="panel-content" inert={!panelOpen}>
        {tabs.length === 0 && (
          <div className="panel-empty">
            <p className="muted small">カードを押すと、ここにチャットが開きます。</p>
            <button className="btn" onClick={panel.openBrowser}>
              <Globe size={14} /> ブラウザを開く
            </button>
          </div>
        )}
        {/* タブを切り替えても入力中の文章やスクロール位置が残るよう、開いているタブはすべて保持する */}
        {tabs.map((t) => (
          <div key={t.key} className="panel-tab-page" hidden={activeTab !== t.key}>
            {t.kind === "chat" ? (
              <RunPage projectId={t.projectId} runId={t.id} focus={t.focus} onClose={panel.close} />
            ) : t.kind === "new" ? (
              <NewChatPane
                projectId={t.projectId}
                section={t.section}
                stage={t.stage}
                group={t.group}
                projects={panel.projects}
                onProjectChange={(projectId) => panel.updateTab(t.key, () => ({ ...t, projectId, group: undefined, groupName: undefined }))}
                onGroupChange={(group, groupName) => panel.updateTab(t.key, (x) => (x.kind === "new" ? { ...x, group, groupName } : x))}
                onClose={panel.close}
                onCreated={(run) => panel.replaceWithChat(t.key, run)}
              />
            ) : (
              <BrowserPane
                url={t.url}
                onChange={({ url, title }) =>
                  // 空のページのあいだは「新しいタブ」と表示する
                  panel.updateTab(t.key, (x) => (x.kind === "browser" ? { ...x, title: url === "about:blank" ? "" : title } : x))
                }
              />
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}

/** ボードの見出し（「ボード／リスト」の右）に置く、パネルの開閉ボタン。閉じていて開いたタブがあれば数を出す */
export function PanelToggle({ panel }: { panel: SidePanelController }) {
  const { panelOpen, tabs } = panel;
  return (
    <button
      className={cx("icon-button panel-toggle", panelOpen && "active")}
      title={panelOpen ? "右側のパネルを閉じる（Esc）" : "右側のパネルを開く"}
      aria-label={panelOpen ? "右側のパネルを閉じる" : "右側のパネルを開く"}
      aria-pressed={panelOpen}
      onClick={panel.toggle}
    >
      {panelOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
      {!panelOpen && tabs.length > 0 && <span className="panel-toggle-count">{tabs.length}</span>}
    </button>
  );
}

/** 列・グループに出す、送る前の新しいチャット（パネルで入力中）の下書き */
export function DraftCards({ panel, filter }: { panel: SidePanelController; filter: (target: NewChatTarget) => boolean }) {
  return panel.drafts
    .filter((d) => filter(d.target))
    .map((d) => <DraftCard key={d.key} active={panel.isShowingTab(d.key)} onOpen={() => panel.showTab(d.key)} onDelete={() => panel.closeTab(d.key)} />);
}

/** 下書きのカード。押すとそのタブを表示し、右クリックで開く・削除を選べる */
function DraftCard({ active, onOpen, onDelete }: { active: boolean; onOpen: () => void; onDelete: () => void }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <button
        type="button"
        className={cx("draft-card", active && "selected")}
        title="右側で入力中の新しいチャット（右クリックで削除）"
        onClick={onOpen}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu(clampToViewport(e.clientX, e.clientY, 220, 120));
        }}
      >
        <SquarePen size={14} aria-hidden />
        新しいチャット（入力中）
      </button>
      {menu && (
        <PopupMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <button role="menuitem" onClick={() => (onOpen(), setMenu(null))}>
            <SquarePen size={14} /> 開く
          </button>
          <button role="menuitem" className="danger" onClick={() => (onDelete(), setMenu(null))}>
            <Trash2 size={14} /> 削除（入力中の内容は消えます）
          </button>
        </PopupMenu>
      )}
    </>
  );
}
