import { useSetting } from "@/hooks/useSetting";
import { readSetting, writeSetting } from "@/lib/storage";
import { panelTabKinds } from "@/lib/storageKeys";
import type { PaneLeaf } from "@/features/panel/layout/paneLayout";
import { SURFACES, type PanelSurface } from "@/features/panel/surfaces";

/** 表示を切り替えるタブの種類（チャットには、新しいチャット・サブエージェントのタブも入る） */
export type PanelKind = "chat" | "browser" | "terminal";
export const PANEL_KINDS: readonly PanelKind[] = ["chat", "browser", "terminal"];
export const PANEL_KIND_LABELS: Record<PanelKind, string> = { chat: "チャット", browser: "ブラウザ", terminal: "ターミナル" };

/** 保存した値を読む（知らない値は捨て、何もなければ欄の既定 SURFACES の defaultKinds） */
export function decodeKinds(stored: readonly string[], surface: PanelSurface): readonly PanelKind[] {
  const kinds = PANEL_KINDS.filter((k) => stored.includes(k));
  return kinds.length > 0 ? kinds : SURFACES[surface].defaultKinds;
}

/** 1 つ付け外ししたあとの種類（最後の 1 つは外さない） */
export function toggleKind(kinds: readonly PanelKind[], kind: PanelKind): readonly PanelKind[] {
  if (!kinds.includes(kind)) return PANEL_KINDS.filter((k) => k === kind || kinds.includes(k));
  return kinds.length > 1 ? kinds.filter((k) => k !== kind) : kinds;
}

/**
 * ペインで見せる表示中のタブ。表示中のタブの種類を隠しているときは、そのペインで見せている種類の最初のタブ（なければ null = 空のペイン）。
 * 隠した種類のタブは閉じずに残す（シェル・ページ・書きかけの文を保つ）
 */
export function shownActiveOf(pane: PaneLeaf, visible: (key: string) => boolean): string | null {
  if (pane.active !== null && visible(pane.active)) return pane.active;
  return pane.tabs.find(visible) ?? null;
}

/** 欄でいま見せている種類（React の外からも読む） */
export const readKinds = (surface: PanelSurface): readonly PanelKind[] => decodeKinds(readSetting(panelTabKinds(surface)), surface);

/** その種類を出す（隠している種類のタブを自分で開いたとき） */
export function showKind(surface: PanelSurface, kind: PanelKind) {
  const kinds = readKinds(surface);
  if (!kinds.includes(kind)) writeSetting(panelTabKinds(surface), [...toggleKind(kinds, kind)]);
}

/** 欄で表示するタブの種類（タブの列の「表示するタブ」で切り替え、欄ごとに覚える） */
export function usePanelKinds(surface: PanelSurface) {
  const [stored, setStored] = useSetting(panelTabKinds(surface));
  const kinds = decodeKinds(stored, surface);
  return {
    kinds,
    has: (kind: PanelKind) => kinds.includes(kind),
    toggle: (kind: PanelKind) => setStored([...toggleKind(kinds, kind)]),
  };
}
