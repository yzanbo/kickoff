import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { startVerticalDrag } from "../../hooks/dragResize";
import { useStoredNumber } from "../../hooks/useStoredState";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import { BOTTOM_PANEL_HEIGHT_KEY } from "../../storageKeys";
import { newTabKey } from "../sidePanel/tabKeys";
import type { TerminalTarget } from "../sidePanel/useSidePanel";

/** 1 つのシェル（key は裏のシェルのキー） */
interface TerminalPaneInfo extends TerminalTarget {
  key: string;
}

/** 下のパネルのタブ 1 つ（VS Code のターミナルのグループと同じ。分割すると、ペインが左右に並ぶ） */
export interface TerminalGroup {
  key: string;
  projectId: number;
  label: string;
  panes: TerminalPaneInfo[];
  /** ペインの幅の割合（足すと 1） */
  sizes: number[];
  /** 入力先のペイン */
  activePane: string;
}

/** どの画面のパネルか（プロジェクトの ID。全プロジェクトの画面は "all"） */
type BottomScope = number | "all";

/** 画面ごとの、開いているか・表示しているタブ */
interface ScopeState {
  open: boolean;
  active: string | null;
}

const DEFAULT_HEIGHT = 198;
const MIN_HEIGHT = 120;
/** 上の画面に残す高さ */
const KEEP_ABOVE = 120;

const equalSizes = (n: number) => Array.from({ length: n }, () => 1 / n);

export type BottomPanelController = ReturnType<typeof useBottomPanel>;

/**
 * 画面の下のパネル（VS Code と同じく、どの画面でも ⌃` か ⌘J で開閉するターミナル）の状態と操作。
 * ターミナルはプロジェクトごと（VS Code のウィンドウごとと同じ）: プロジェクトの画面ではそのプロジェクトのタブだけを出し、
 * 開いているか・表示しているタブもプロジェクトごとに覚える。全プロジェクトの画面ではすべてのプロジェクトのタブを出す。
 * タブは分割でき（⌘\）、ペインは左右に並ぶ（⌥⌘← / → で移る）。
 * scope: いまの画面（プロジェクトの ID か "all"）。targets: 新しいターミナルを開く場所（terminalTargets）。
 * 表示は BottomPanel。シェルはメインプロセスで動き続けるので、閉じても・ほかのプロジェクトに移ってもタブは残す
 */
export function useBottomPanel(scope: BottomScope, targets: TerminalTarget[]) {
  const [groups, setGroups] = useState<TerminalGroup[]>([]);
  const [scopes, setScopes] = useState<Record<string, ScopeState>>({});
  const [maximized, setMaximized] = useState(false);
  const [height, setHeight] = useStoredNumber(BOTTOM_PANEL_HEIGHT_KEY, DEFAULT_HEIGHT);
  const [resizing, setResizing] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const available = Boolean(window.kickoff?.terminal);

  const inScope = (g: TerminalGroup) => scope === "all" || g.projectId === scope;
  const tabs = groups.filter(inScope);
  const saved = scopes[String(scope)];
  const open = saved?.open ?? false;
  // 表示しているタブ（閉じられていたら、その画面の先頭のタブ）
  const active = tabs.find((g) => g.key === saved?.active) ?? tabs[0];
  const setScope = (update: Partial<ScopeState>) =>
    setScopes((prev) => ({ ...prev, [String(scope)]: { ...(prev[String(scope)] ?? { open, active: active?.key ?? null }), ...update } }));
  const updateGroup = (key: string, update: (g: TerminalGroup) => TerminalGroup) => setGroups((prev) => prev.map((g) => (g.key === key ? update(g) : g)));

  const openTerminal = (target: TerminalTarget) => {
    const pane: TerminalPaneInfo = { key: newTabKey("bottom"), ...target };
    const group: TerminalGroup = { key: newTabKey("group"), projectId: target.projectId, label: target.label, panes: [pane], sizes: [1], activePane: pane.key };
    setGroups((prev) => [...prev, group]);
    setScope({ open: true, active: group.key });
  };

  /** 開閉。開くときにこの画面のタブがなく、開く場所が 1 つ（プロジェクトの画面）なら、そこでターミナルを始める */
  const toggle = () => {
    if (open) return setScope({ open: false });
    if (tabs.length === 0 && targets.length === 1) return openTerminal(targets[0]);
    setScope({ open: true });
  };

  /** タブを閉じる（中のシェルもすべて止める）。この画面の最後のタブならパネルも閉じる */
  const closeTab = (key: string) => {
    const group = groups.find((g) => g.key === key);
    group?.panes.forEach((p) => void window.kickoff?.terminal.close(p.key));
    const index = tabs.findIndex((g) => g.key === key);
    const rest = tabs.filter((g) => g.key !== key);
    // 続けて閉じても取りこぼさないよう、いまの一覧から消す
    setGroups((prev) => prev.filter((g) => g.key !== key));
    if (rest.length === 0) {
      setScope({ open: false, active: null });
      setMaximized(false);
    } else if (active?.key === key) {
      setScope({ active: rest[Math.min(index, rest.length - 1)].key });
    }
  };

  /** 表示しているタブを分割する（入力先のペインと同じフォルダで、その右に新しいペインを開く） */
  const split = () => {
    if (!active) return;
    const from = active.panes.find((p) => p.key === active.activePane) ?? active.panes[0];
    const pane: TerminalPaneInfo = { key: newTabKey("bottom"), cwd: from.cwd, label: from.label, projectId: from.projectId };
    updateGroup(active.key, (g) => {
      const at = g.panes.findIndex((p) => p.key === g.activePane) + 1;
      const panes = [...g.panes.slice(0, at), pane, ...g.panes.slice(at)];
      return { ...g, panes, sizes: equalSizes(panes.length), activePane: pane.key };
    });
  };

  /** ペインを閉じる（シェルも止める）。最後のペインならタブごと閉じる */
  const closePane = (groupKey: string, paneKey: string) => {
    const group = groups.find((g) => g.key === groupKey);
    if (!group) return;
    if (group.panes.length <= 1) return closeTab(groupKey);
    void window.kickoff?.terminal.close(paneKey);
    updateGroup(groupKey, (g) => {
      const index = g.panes.findIndex((p) => p.key === paneKey);
      const panes = g.panes.filter((p) => p.key !== paneKey);
      // 閉じたペインの幅は、残りに割合のまま配る
      const kept = g.sizes.filter((_, i) => i !== index);
      const total = kept.reduce((a, b) => a + b, 0) || 1;
      const activePane = g.activePane === paneKey ? panes[Math.min(index, panes.length - 1)].key : g.activePane;
      return { ...g, panes, sizes: kept.map((s) => s / total), activePane };
    });
  };

  /** 入力先のペインを左右に移す（⌥⌘← / →） */
  const movePane = (step: -1 | 1) => {
    if (!active || active.panes.length < 2) return;
    const index = active.panes.findIndex((p) => p.key === active.activePane);
    const next = active.panes[(index + step + active.panes.length) % active.panes.length];
    updateGroup(active.key, (g) => ({ ...g, activePane: next.key }));
  };

  /** 上の端をドラッグして高さを変える（ダブルクリックで元の高さ） */
  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    const panel = panelRef.current;
    const column = panel?.parentElement;
    if (!panel || !column) return;
    const bottom = column.getBoundingClientRect().bottom;
    const max = column.clientHeight - KEEP_ABOVE;
    let next = height;
    if (maximized) setMaximized(false);
    setResizing(true);
    startVerticalDrag(e, {
      move: (clientY) => {
        next = Math.round(Math.max(MIN_HEIGHT, Math.min(max, bottom - clientY)));
        panel.style.setProperty("--bottom-h", `${next}px`);
      },
      end: () => {
        setResizing(false);
        setHeight(next);
      },
    });
  };

  // ⌃`（VS Code と同じ）か ⌘J で開閉。ターミナルの中で押しても効くよう、ほかより先に受け取る。
  // 下のパネルの中では、⌘\ で分割・⌥⌘← / → でペインを移る（サイドバーのプロジェクトの切り替えより先に受け取る）
  useWindowEvent(
    "keydown",
    (e) => {
      const ctrlBackquote = e.ctrlKey && !e.metaKey && e.code === "Backquote";
      const cmdJ = e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "j";
      const inPanel = open && e.target instanceof Node && Boolean(panelRef.current?.contains(e.target));
      const cmdBackslash = inPanel && e.metaKey && !e.altKey && e.code === "Backslash";
      const arrow = inPanel && e.metaKey && e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight") && (active?.panes.length ?? 0) > 1;
      if (!ctrlBackquote && !cmdJ && !cmdBackslash && !arrow) return;
      e.preventDefault();
      e.stopPropagation();
      if (cmdBackslash) split();
      else if (arrow) movePane(e.key === "ArrowLeft" ? -1 : 1);
      else toggle();
    },
    available,
    true,
  );

  return {
    available,
    open,
    tabs,
    /** すべてのプロジェクトのタブ（裏のタブも画面を保持するため、表示はしないが部品は置いておく） */
    groups,
    active: active?.key ?? null,
    maximized,
    targets,
    toggle,
    close: () => setScope({ open: false }),
    openTerminal,
    closeTab,
    split,
    closePane,
    /** ペインを押した・入力したとき、そのペインを入力先にする */
    focusPane: (groupKey: string, paneKey: string) => updateGroup(groupKey, (g) => (g.activePane === paneKey ? g : { ...g, activePane: paneKey })),
    resizePanes: (groupKey: string, sizes: number[]) => updateGroup(groupKey, (g) => ({ ...g, sizes })),
    showTab: (key: string) => setScope({ active: key }),
    toggleMaximized: () => setMaximized((m) => !m),
    startResize,
    resetHeight: () => setHeight(DEFAULT_HEIGHT),
    /** パネルの要素に渡す */
    // 開閉は高さの動きで見せる（中身は開いたときの高さのまま。ターミナルが動いている間に何度も大きさを変えないように）
    panelProps: {
      ref: panelRef,
      style: { "--bottom-h": `${height}px` } as CSSProperties,
    },
    resizing,
  };
}
