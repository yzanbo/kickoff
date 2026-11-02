import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { BoardStage, Phase, ProjectSummary, Run } from "../../../../core/types";
import { cx } from "../../cx";
import { useServerEvent } from "../../events";
import { startHorizontalDrag } from "../../hooks/dragResize";
import { useStoredFlag, useStoredNumber } from "../../hooks/useStoredState";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import { sidebarOrder } from "../../projectOrder";

/** 新しいチャットを始めるときの指定（どのプロジェクト・セクション・列・グループで始めるか） */
export interface NewChatTarget {
  projectId: number;
  section?: Phase;
  stage?: BoardStage;
  group?: number;
}

/** 右側のパネルのタブ（チャット・新しいチャット・ブラウザ・ターミナル） */
export type PanelTab =
  /** title・phase: タブに出すチャットの名前とセクション（開いたとき・チャットの画面が読み込んだときに入れる） */
  | { key: string; kind: "chat"; id: number; projectId: number; focus?: number; title?: string; phase?: Phase }
  /** groupName: タブに出す作成先のグループ名（パネルの中で分かりしだい入れる） */
  | ({ key: string; kind: "new"; groupName?: string } & NewChatTarget)
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

const PANEL_WIDTH_KEY = "kickoff:panel-width";
const PANEL_MAX_KEY = "kickoff:panel-maximized";
const DEFAULT_PANEL_WIDTH = 560;
const MIN_PANEL_WIDTH = 360;

/** パネルの状態（ボードごと） */
interface PanelState {
  tabs: PanelTab[];
  activeTab: string | null;
  panelOpen: boolean;
}

/**
 * ボードごとの、開いているタブとパネルの開閉。カンバンとグループのタブを切り替えると、ボードの部品は作り直されるので、
 * 戻ってきたときに元どおりにできるよう、ここに覚えておく（アプリを閉じるまで）
 */
const panelMemory = new Map<string, PanelState>();
const EMPTY_PANEL: PanelState = { tabs: [], activeTab: null, panelOpen: false };

interface Options {
  /** パネルの状態を覚えておく名前（画面ごとに分ける。例: "project:3"・"kanban:all"） */
  memoryKey: string;
  /** 全プロジェクトの画面では、新しいチャットのプロジェクトを選べるようにする */
  projects?: ProjectSummary[];
  /** 新しいチャットができたとき（URL をそのチャットにするなど） */
  onCreated?: (run: Run) => void;
}

export type SidePanelController = ReturnType<typeof useSidePanel>;

/**
 * 画面の右側から出てくるパネル（チャット・新しいチャット・ブラウザ・ターミナルのタブ）の状態と操作。
 * プロジェクトの画面ではどのタブでも同じパネル（プロジェクトごと）、全プロジェクトの画面はそれだけのパネル。
 * 表示は PanelLayout（画面の中身と並べる）・PanelToggle（開閉ボタン）・DraftCards（列の下書き）で行う
 */
export function useSidePanel({ memoryKey, projects, onCreated }: Options) {
  // パネルを閉じてもタブは残し、次に開いたときに戻す
  const saved = () => panelMemory.get(memoryKey) ?? EMPTY_PANEL;
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
    if (shownKey === memoryKey) panelMemory.set(memoryKey, { tabs, activeTab, panelOpen });
  }, [memoryKey, shownKey, tabs, activeTab, panelOpen]);
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
    const key = `new:${target.projectId}:${target.section ?? ""}:${target.stage ?? ""}:${target.group ?? ""}`;
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
  const closeTab = (key: string) => {
    if (tabs.some((t) => t.key === key && t.kind === "terminal")) void window.kickoff?.terminal.close(key);
    setTabs((prev) => {
      const index = prev.findIndex((t) => t.key === key);
      const next = prev.filter((t) => t.key !== key);
      if (activeTab === key) setActiveTab(next[Math.min(index, next.length - 1)]?.key ?? null);
      if (next.length === 0) setPanelOpen(false);
      return next;
    });
  };

  // 削除・アーカイブしたチャットのタブは閉じる
  useServerEvent((e) => {
    const gone = e.type === "run_deleted" ? e.id : e.type === "run" && e.run.archived_at ? e.run.id : null;
    if (gone !== null && tabs.some((t) => t.key === chatKey(gone))) closeTab(chatKey(gone));
  });

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
      if (e.key === "Escape" && !document.querySelector("dialog[open], .menu")) close();
    },
    panelOpen,
  );

  return {
    tabs,
    activeTab,
    panelOpen,
    maximized,
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
