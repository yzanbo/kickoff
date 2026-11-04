import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectSummary, Run } from "../../../../core/types";
import { cx } from "../../cx";
import { useServerEvent } from "../../events";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import { sidebarOrder } from "../../projectOrder";
import { paneActions } from "./paneActions";
import { activeTabOf, closeLayoutTabs, isTabVisible, placeTab, reconcileLayout, renameTab, type PaneLayout } from "./paneLayout";
import { loadPanel, registerPanel, savePanel } from "./panelMemory";
import { newTabKey } from "./tabKeys";
import { usePanelWidth } from "./usePanelWidth";
import type { NewChatSeed } from "../chat/askInNewChat";

/** 新しいチャットを始めるときの指定（どのプロジェクト・グループで始めるか） */
export interface NewChatTarget {
  projectId: number;
  group?: number;
}

/** 右側のパネルのタブ（チャット・新しいチャット・サブエージェント・ブラウザ・ターミナル） */
export type PanelTab =
  /** title: タブに出すチャットの名前（開いたとき・チャットの画面が読み込んだときに入れる） */
  /** status / attention: タブの中のチャットから届いた最新の状態（ボードの一覧にないチャットでも、タブに状態の印を出すため） */
  /** run: タブの中のチャットから届いた最新のチャット（右クリックのメニューの固定・アーカイブ・セッション ID などに使う） */
  | { key: string; kind: "chat"; id: number; projectId: number; focus?: number; title?: string; status?: Run["status"]; attention?: boolean; run?: Run }
  /** groupName: タブに出す作成先のグループ名（パネルの中で分かりしだい入れる）。draftText: 書いている途中の文（下書きのカードに出す）。seed: 初めに入力欄に入れるもの（送信待ちの指示から始めたとき） */
  | ({ key: string; kind: "new"; groupName?: string; draftText?: string; seed?: NewChatSeed } & NewChatTarget)
  /** チャットの中のサブエージェントの中身（toolUseId: Task / Agent の呼び出し ID。title: タブに出す名前） */
  | { key: string; kind: "subagent"; runId: number; projectId: number; toolUseId: string; title: string }
  /** url は開いたときのページ（webview の初めの src）、current はいま表示しているページ（外のブラウザで開くときに渡す） */
  | { key: string; kind: "browser"; url: string; title: string; current?: string }
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


interface Options {
  /** パネルの状態を覚えておく名前（ボードは boardPanelKey。例: "kanban:all"・"kanban:3"、チャット欄は "side:3"） */
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
 * タブは上下・左右のペインに分けて並べられる（配置は paneLayout の木。新しく開くタブは、ピントのあるペインに入る）。
 * 表示は SidePanel（body の中の最後に置く）・PanelToggle（見出しの開閉ボタン）・DraftCards（列の下書き）で行う
 */
export function useSidePanel({ memoryKey, runs = NO_RUNS, loaded = false, holdEsc = false, projects, onCreated }: Options) {
  // パネルを閉じてもタブは残し、次に開いたときに戻す
  const saved = () => loadPanel(memoryKey);
  const [tabs, setTabs] = useState<PanelTab[]>(() => saved().tabs);
  // 分割の配置（タブのキーを指す木と、ピントのあるペイン）
  const [rawLayout, setLayout] = useState<PaneLayout>(() => saved().layout);
  const [panelOpen, setPanelOpen] = useState(() => saved().panelOpen);
  // 同じ部品のまま別のボード（プロジェクト）に切り替わったら、そのボードで覚えている状態に戻す
  const [shownKey, setShownKey] = useState(memoryKey);
  if (shownKey !== memoryKey) {
    const next = saved();
    setShownKey(memoryKey);
    setTabs(next.tabs);
    setLayout(next.layout);
    setPanelOpen(next.panelOpen);
  }
  // 配置といまのタブが食い違っても（どのペインにもないタブなど）壊れないよう、直したものを使う
  const layout = useMemo(() => reconcileLayout(rawLayout, tabs.map((t) => t.key)), [rawLayout, tabs]);
  /** ピントのあるペインの表示中のタブ（分割する前の「表示中のタブ」と同じ意味） */
  const activeTab = activeTabOf(layout);
  useEffect(() => {
    if (shownKey === memoryKey) savePanel(memoryKey, { tabs, activeTab, panelOpen, layout });
  }, [memoryKey, shownKey, tabs, activeTab, panelOpen, layout]);
  // 幅と横幅いっぱい（ボードを覆う）
  const size = usePanelWidth();

  /** タブを表示する（どこかのペインにあればそこで、なければピントのあるペインに足す）。ピントもそのペインへ */
  const reveal = (key: string) => {
    setLayout((l) => placeTab(l, key));
    setPanelOpen(true);
  };
  /** 開いているタブを表示する（タブ・下書きを押したとき。ないタブなら何もしない） */
  const show = (key: string) => {
    if (tabs.some((t) => t.key === key)) reveal(key);
  };

  /**
   * 右側のパネルにタブで開く（開いていればそのタブへ）。ボードはその分狭くなる。
   * focus は検索結果から開いたときに、スクロールして強調する発言
   */
  const open = (run: Pick<Run, "id" | "project_id"> & Partial<Pick<Run, "title">>, focus?: number) => {
    const key = chatKey(run.id);
    const tab: PanelTab = { key, kind: "chat", id: run.id, projectId: run.project_id, focus, title: run.title };
    setTabs((prev) => (prev.some((t) => t.key === key) ? prev.map((t) => (t.key === key && focus ? tab : t)) : [...prev, tab]));
    reveal(key);
  };

  /**
   * 新しいチャットのタブを開く（ボードや列・グループの＋、サイドバーの＋など）。
   * ブラウザ・ターミナルと同じく、押すたびに新しいタブを開く（書きかけの新しいチャットがあっても、もう 1 つ始められる）
   */
  const lastNew = useRef<{ target: string; key: string; at: number }>(undefined);
  const openNew = (target: NewChatTarget, seed?: NewChatSeed) => {
    // 同じ指定でほぼ同時に呼ばれたとき（開発時の effect の二重実行）だけ 1 つにまとめる（初めの入力があるものは利用者の操作なのでまとめない）
    const sig = `${target.projectId}:${target.group ?? ""}`;
    const recent = lastNew.current;
    const key = !seed && recent && recent.target === sig && Date.now() - recent.at < 100 ? recent.key : newTabKey("new");
    lastNew.current = { target: sig, key, at: Date.now() };
    const tab: PanelTab = { key, kind: "new", ...target, ...(seed ? { seed, draftText: seed.text } : {}) };
    setTabs((prev) => (prev.some((t) => t.key === key) ? prev : [...prev, tab]));
    reveal(key);
  };

  /** サブエージェントの中身をタブで開く（同じサブエージェントのタブがあればそこへ） */
  const openSubagent = ({ runId, projectId, toolUseId, title }: { runId: number; projectId: number; toolUseId: string; title: string }) => {
    const key = `subagent:${runId}:${toolUseId}`;
    setTabs((prev) => (prev.some((t) => t.key === key) ? prev : [...prev, { key, kind: "subagent", runId, projectId, toolUseId, title }]));
    reveal(key);
  };

  /** ブラウザの新しいタブを開く（url がなければ空のページで、アドレス欄に入力して開く） */
  const openBrowser = (url = "") => {
    const key = `browser:${Date.now()}`;
    setTabs((prev) => [...prev, { key, kind: "browser", url, title: "" }]);
    reveal(key);
  };

  /** 内蔵ターミナルの新しいタブを開く（cwd のフォルダでシェルを始める） */
  const openTerminal = ({ cwd, label }: TerminalTarget) => {
    const key = newTabKey("terminal");
    setTabs((prev) => [...prev, { key, kind: "terminal", cwd, label }]);
    reveal(key);
  };

  /** タブの中身を変える（新しいチャットのプロジェクト・グループ、ブラウザのタイトルなど） */
  const updateTab = (key: string, update: (tab: PanelTab) => PanelTab) => setTabs((prev) => prev.map((t) => (t.key === key ? update(t) : t)));

  /** 新しいチャットを送ったら、そのタブをできたチャットのタブに置き換える（同じペインの同じ位置のまま） */
  const replaceWithChat = (key: string, run: Run) => {
    const chat: PanelTab = { key: chatKey(run.id), kind: "chat", id: run.id, projectId: run.project_id, title: run.title };
    updateTab(key, () => chat);
    setLayout((l) => renameTab(l, key, chat.key));
    onCreated?.(run);
  };

  const close = () => setPanelOpen(false);
  const reopen = () => setPanelOpen(true);

  /**
   * タブを閉じる。表示中のタブならそのペインの隣のタブへ。空になったペインは消し、最後のタブならパネルも閉じる。
   * ターミナルはシェルも止める。base はペインを閉じたあとの配置など、閉じる前に変えておいた配置
   */
  const closeMany = (keys: string[], base: PaneLayout = layout) => {
    const closing = new Set(keys);
    for (const t of tabs) if (closing.has(t.key) && t.kind === "terminal") void window.kickoff?.terminal.close(t.key);
    // 次の状態は純粋関数で決め、state の更新は updater の外で行う（updater の中の副作用は StrictMode で 2 回走る）
    const nextTabs = tabs.filter((t) => !closing.has(t.key));
    if (nextTabs.length === tabs.length && base === layout) return;
    setTabs(nextTabs);
    setLayout(closeLayoutTabs(base, keys));
    if (nextTabs.length === 0) setPanelOpen(false);
  };
  const closeTab = (key: string) => closeMany([key]);
  // サイドバーの下書きから、このパネルのタブを表示する・閉じる・作成先のグループを変えるために登録する（いつも最新の関数を呼ぶ）
  const openerRef = useRef({ show, close: closeTab, update: updateTab });
  openerRef.current = { show, close: closeTab, update: updateTab };
  useEffect(
    () =>
      registerPanel(memoryKey, {
        show: (key) => openerRef.current.show(key),
        close: (key) => openerRef.current.close(key),
        update: (key, change) => openerRef.current.update(key, change),
      }),
    [memoryKey],
  );

  // 削除したチャットのタブ（そのチャットのサブエージェントのタブも）は閉じる（ボードのないチャット欄でも）
  useServerEvent((e) => {
    if (e.type !== "run_deleted") return;
    const gone = tabs.filter((t) => t.key === chatKey(e.id) || (t.kind === "subagent" && t.runId === e.id));
    if (gone.length > 0) closeMany(gone.map((t) => t.key));
  });

  // 削除・アーカイブされたチャットのタブは閉じる
  useEffect(() => {
    const gone = tabs.filter((t) => t.kind === "chat" && !runs.some((r) => r.id === t.id));
    if (loaded && gone.length > 0) closeMany(gone.map((t) => t.key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, loaded]);

  // Esc でパネルを閉じる（メニューやダイアログが開いていればそちらを優先）
  useWindowEvent(
    "keydown",
    (e) => {
      if (e.key === "Escape" && !holdEsc && !document.querySelector("dialog[open]")) close();
    },
    panelOpen,
  );

  /** パネルでこのタブを見せているか（分割していれば、どれかのペインで表示中） */
  const isShowingTab = (key: string) => panelOpen && isTabVisible(layout, key);

  return {
    tabs,
    activeTab,
    /** 分割の配置（直したもの） */
    layout,
    panelOpen,
    maximized: size.maximized,
    /** 横に残るボードが狭すぎて、パネルでボードを覆っているか（横幅いっぱいの切り替えは出さない） */
    covering: size.covering,
    runs,
    projects,
    open,
    openNew,
    openBrowser,
    openTerminal,
    openSubagent,
    /** タブを表示する（タブ・下書きを押したとき） */
    showTab: show,
    closeTab,
    updateTab,
    replaceWithChat,
    close,
    toggle: () => (panelOpen ? close() : reopen()),
    toggleMaximized: size.toggleMaximized,
    startResize: size.startResize,
    ...paneActions(layout, setLayout, closeMany),
    /** 送る前の新しいチャットのタブ（ボードの列・グループに下書きとして出す） */
    drafts: tabs.flatMap((t) =>
      t.kind === "new" ? [{ key: t.key, text: t.draftText ?? "", target: { projectId: t.projectId, group: t.group } }] : [],
    ),
    isShowingTab,
    /** パネルでこのチャットを表示しているか（カードを選択中として見せる。分割していれば、どれかのペインで） */
    isShowing: (runId: number) => isShowingTab(chatKey(runId)),
    /** このチャットをタブで開いているか */
    hasTab: (runId: number) => tabs.some((t) => t.key === chatKey(runId)),
    /** ボードとパネルを並べる要素に渡す */
    body: {
      ref: size.bodyRef,
      // 覆っているときは間隔を消す（ドラッグ中は指の位置どおりの幅にするので付けない）
      className: cx("board-body", panelOpen && "with-panel", (size.maximized || size.covering) && !size.resizing && "panel-full", size.resizing && "resizing", size.stretching && "stretching"),
      style: size.style,
    },
  };
}
