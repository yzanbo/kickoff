import type { TerminalTarget } from "../sidePanel/useSidePanel";

/** 1 つのシェル（key は裏のシェルのキー） */
export interface TerminalPaneInfo extends TerminalTarget {
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

/** n 個のペインを同じ幅に */
export const equalSizes = (n: number) => Array.from({ length: n }, () => 1 / n);

/** 入力先のペイン（見つからなければ先頭） */
export const activePaneOf = (g: TerminalGroup): TerminalPaneInfo => g.panes.find((p) => p.key === g.activePane) ?? g.panes[0];

/** 分割: 入力先のペインの右に pane を足し、幅をそろえ直して、新しいペインを入力先にする */
export function splitGroup(g: TerminalGroup, pane: TerminalPaneInfo): TerminalGroup {
  const at = g.panes.findIndex((p) => p.key === g.activePane) + 1;
  const panes = [...g.panes.slice(0, at), pane, ...g.panes.slice(at)];
  return { ...g, panes, sizes: equalSizes(panes.length), activePane: pane.key };
}

/** ペインを外す。閉じたペインの幅は残りに割合のまま配り、入力先だったら同じ位置に来たペイン（最後なら 1 つ前）を入力先にする */
export function removePane(g: TerminalGroup, paneKey: string): TerminalGroup {
  const index = g.panes.findIndex((p) => p.key === paneKey);
  const panes = g.panes.filter((p) => p.key !== paneKey);
  const kept = g.sizes.filter((_, i) => i !== index);
  const total = kept.reduce((a, b) => a + b, 0) || 1;
  const activePane = g.activePane === paneKey ? panes[Math.min(index, panes.length - 1)].key : g.activePane;
  return { ...g, panes, sizes: kept.map((s) => s / total), activePane };
}

/** 入力先のペインを左右に移す（端では反対側へ回る） */
export function movePane(g: TerminalGroup, step: -1 | 1): TerminalGroup {
  const index = g.panes.findIndex((p) => p.key === g.activePane);
  const next = g.panes[(index + step + g.panes.length) % g.panes.length];
  return { ...g, activePane: next.key };
}
