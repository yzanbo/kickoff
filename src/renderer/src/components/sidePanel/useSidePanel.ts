import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { Phase, ProjectSummary, Run } from "../../../../core/types";
import { cx } from "../../cx";
import { useServerEvent } from "../../events";
import { startHorizontalDrag } from "../../hooks/dragResize";
import { useStoredFlag, useStoredNumber } from "../../hooks/useStoredState";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import { sidebarOrder } from "../../projectOrder";
import { PANEL_MAXIMIZED_KEY, PANEL_WIDTH_KEY } from "../../storageKeys";
import { loadPanel, registerPanel, savePanel } from "./panelMemory";
import { closeTabs } from "./panelTabs";

/** 新しいチャットを始めるときの指定（どのプロジェクト・セクション・グループで始めるか） */
export interface NewChatTarget {
  projectId: number;
  section?: Phase;
  group?: number;
}

/** 右側のパネルのタブ（チャット・新しいチャット・ブラウザ・ターミナル） */
export type PanelTab =
  /** title・phase: タブに出すチャットの名前とセクション（開いたとき・チャットの画面が読み込んだときに入れる） */
  | { key: string; kind: "chat"; id: number; projectId: number; focus?: number; title?: string; phase?: Phase }
  /** groupName: タブに出す作成先のグループ名（パネルの中で分かりしだい入れる）。draftText: 書いている途中の文（下書きのカードに出す） */
  | ({ key: string; kind: "new"; groupName?: string; draftText?: string } & NewChatTarget)
  | { key: string; kind: "browser"; url: string; title: string }
  /** cwd: シェルを始めるフォルダ（プロジェクトの本体かワークツリー）。label: タブに出す名前。key は裏のシェルのキーにも使う */
  | { key: string; kind: "terminal"; cwd: string; label: string };

/** 内蔵ターミナルを開く場所（タブの列の＋のメニューに出す） */
export interface TerminalTarget {
  cwd: string;
  label: string;
  /** どのプロジェクトのターミナルか */
  projectId: number;
}

/** ボードのタブの列の＋から開けるターミナル（プロジェクトのボードはそのプロジェクトの本体、全プロジェクトのボードは各プロジェクト） */
export function terminalTargets(projects: ProjectSummary[], projectId?: number): TerminalTarget[] {
  const list = projectId === undefined ? sidebarOrder(projects) : projects.filter((p) => p.id === projectId);
  return list.map((p) => ({ cwd: p.repo_path, label: p.name, projectId: p.id }));
}

const chatKey = (id: number) => `chat:${id}`;

const DEFAULT_PANEL_WIDTH = 1127;
const MIN_PANEL_WIDTH = 360;

interface Options {
  /** パネルの状態を覚えておく名前（ボードごとに分ける。例: "kanban:all"・"groups:3"） */
  memoryKey: string;
  /** ボードに出ているチャット（アーカイブされたチャットのタブを閉じるのに使う。ボードのないチャット欄では渡さない） */
  runs?: Run[];
  loaded?: boolean;
  /** true の間は Esc でパネルを閉じない（メニューが開いているときなど） */
  holdEsc?: boolean;
  /** 全プロジェクトのボードでは、新しいチャットのプロジェクトを選べるようにする */
  projects?: ProjectSummary[];
  /** 新しいチャットができたとき（URL をそのチャットにするなど） */
  onCreated?: (run: Run) => void;
}

const NO_RUNS: Run[] = [];

export type SidePanelController = ReturnType<typeof useSidePanel>;

/**
 * ボードの右側から出てくるパネル（チャット・新しいチャット・ブラウザのタブ）の状態と操作。カンバンとグループのボードで共通。
 * 表示は SidePanel（body の中の最後に置く）・PanelToggle（見出しの開閉ボタン）・DraftCards（列の下書き）で行う
 */
export function useSidePanel({ memoryKey, runs = NO_RUNS, loaded = false, holdEsc = false, projects, onCreated }: Options) {
  // パネルを閉じてもタブは残し、次に開いたときに戻す
  const saved = () => loadPanel(memoryKey);
  const [tabs, setTabs] = useState<PanelTab[]>(() => saved().tabs);
  const [activeTab, setActiveTab] = useState<string | null>(() => saved().activeTab);
  const [panelOpen, setPanelOpen] = useState(() => saved().panelOpen);
  // 同じ部品のまま別のボード（プロジェクト）に切り替わったら、そのボードで覚えている状態に戻す
  const [shownKey, setShownKey] = useState(memoryKey);
  if (shownKey !== memoryKey) {
    const next = saved();
    setShownKey(memoryKey);
    setTabs(next.tabs);
    setActiveTab(next.activeTab);
    setPanelOpen(next.panelOpen);
  }
  useEffect(() => {
    if (shownKey === memoryKey) savePanel(memoryKey, { tabs, activeTab, panelOpen });
  }, [memoryKey, shownKey, tabs, activeTab, panelOpen]);
  const [panelWidth, setPanelWidth] = useStoredNumber(PANEL_WIDTH_KEY, DEFAULT_PANEL_WIDTH);
  const [resizing, setResizing] = useState(false);
  // 横幅いっぱい（ボードを覆う）。戻すと、元の幅に戻る
  const [maximized, setMaximized] = useStoredFlag(PANEL_MAXIMIZED_KEY);
  const bodyRef = useRef<HTMLDivElement>(null);

  const show = (key: string) => {
    setActiveTab(key);
    setPanelOpen(true);
  };

  /**
   * 右側のパネルにタブで開く（開いていればそのタブへ）。ボードはその分狭くなる。
   * focus は検索結果から開いたときに、スクロールして強調する発言
   */
  const open = (run: Pick<Run, "id" | "project_id"> & Partial<Pick<Run, "title" | "phase">>, focus?: number) => {
    const key = chatKey(run.id);
    const tab: PanelTab = { key, kind: "chat", id: run.id, projectId: run.project_id, focus, title: run.title, phase: run.phase };
    setTabs((prev) => (prev.some((t) => t.key === key) ? prev.map((t) => (t.key === key && focus ? tab : t)) : [...prev, tab]));
    show(key);
  };

  /**
   * 新しいチャットのタブを開く（ボードや列・グループの＋、サイドバーの＋など）。
   * 同じ指定のまだ送っていないタブがあれば、それを表示する
   */
  const openNew = (target: NewChatTarget) => {
    // 指定ごとに決まったキーにして、続けて呼ばれても（開発時の二重実行でも）1 つにまとめる
    const key = `new:${target.projectId}:${target.section ?? ""}:${target.group ?? ""}`;
    setTabs((prev) => (prev.some((t) => t.key === key) ? prev : [...prev, { key, kind: "new", ...target }]));
    show(key);
  };

  /** ブラウザの新しいタブを開く（url がなければ空のページで、アドレス欄に入力して開く） */
  const openBrowser = (url = "") => {
    const key = `browser:${Date.now()}`;
    setTabs((prev) => [...prev, { key, kind: "browser", url, title: "" }]);
    show(key);
  };

  /** 内蔵ターミナルの新しいタブを開く（cwd のフォルダでシェルを始める） */
  const openTerminal = ({ cwd, label }: TerminalTarget) => {
    const key = `terminal:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    setTabs((prev) => [...prev, { key, kind: "terminal", cwd, label }]);
    show(key);
  };

  /** タブの中身を変える（新しいチャットのプロジェクト・グループ、ブラウザのタイトルなど） */
  const updateTab = (key: string, update: (tab: PanelTab) => PanelTab) => setTabs((prev) => prev.map((t) => (t.key === key ? update(t) : t)));

  /** 新しいチャットを送ったら、そのタブをできたチャットのタブに置き換える */
  const replaceWithChat = (key: string, run: Run) => {
    const chat: PanelTab = { key: chatKey(run.id), kind: "chat", id: run.id, projectId: run.project_id, title: run.title, phase: run.phase };
    updateTab(key, () => chat);
    setActiveTab(chat.key);
    onCreated?.(run);
  };

  const close = () => setPanelOpen(false);
  const reopen = () => setPanelOpen(true);

  /** タブを閉じる。表示中のタブなら隣のタブへ、最後のタブならパネルも閉じる。ターミナルはシェルも止める */
  const closeMany = (keys: string[]) => {
    const closing = new Set(keys);
    for (const t of tabs) if (closing.has(t.key) && t.kind === "terminal") void window.kickoff?.terminal.close(t.key);
    // 次に表示するタブは純粋関数で決め、state の更新は updater の外で行う（updater の中の副作用は StrictMode で 2 回走る）
    const next = closeTabs(tabs, keys, activeTab);
    if (next.tabs.length === tabs.length) return;
    setTabs(next.tabs);
    if (next.activeTab !== activeTab) setActiveTab(next.activeTab);
    if (next.tabs.length === 0) setPanelOpen(false);
  };
  const closeTab = (key: string) => closeMany([key]);
  // サイドバーの下書きから、このパネルのタブを表示する・閉じるために登録する（いつも最新の関数を呼ぶ）
  const openerRef = useRef({ show: (key: string) => show(key), close: closeTab });
  openerRef.current = { show: (key: string) => show(key), close: closeTab };
  useEffect(() => registerPanel(memoryKey, { show: (key) => openerRef.current.show(key), close: (key) => openerRef.current.close(key) }), [memoryKey]);

  // 削除したチャットのタブは閉じる（ボードのないチャット欄でも）
  useServerEvent((e) => {
    if (e.type === "run_deleted" && tabs.some((t) => t.key === chatKey(e.id))) closeTab(chatKey(e.id));
  });

  // 削除・アーカイブされたチャットのタブは閉じる
  useEffect(() => {
    const gone = tabs.filter((t) => t.kind === "chat" && !runs.some((r) => r.id === t.id));
    if (loaded && gone.length > 0) closeMany(gone.map((t) => t.key));
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
    openTerminal,
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
    drafts: tabs.flatMap((t) =>
      t.kind === "new" ? [{ key: t.key, text: t.draftText ?? "", target: { projectId: t.projectId, section: t.section, group: t.group } }] : [],
    ),
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
