import { useSharedList } from "@/hooks/useStoredState";
import { panelTabKindsKey } from "@/lib/storageKeys";
import type { PaneLeaf } from "@/features/panel/layout/paneLayout";
import type { PanelTab } from "@/features/panel/usePanel";

/** タブの欄（board = ボードの右のパネル / side = 画面の右端のチャット欄 / bottom = フッター（下のパネル）） */
export type PanelSurface = "board" | "side" | "bottom";

/** 表示を切り替えるタブの種類（チャットには、新しいチャット・サブエージェントのタブも入る） */
export type PanelKind = "chat" | "browser" | "terminal";
export const PANEL_KINDS: readonly PanelKind[] = ["chat", "browser", "terminal"];
export const PANEL_KIND_LABELS: Record<PanelKind, string> = { chat: "チャット", browser: "ブラウザ", terminal: "ターミナル" };

/** 欄ごとの初めの表示（ボードはチャットだけ、チャット欄はブラウザとターミナル、フッターはターミナルとブラウザ） */
const DEFAULT_KINDS: Record<PanelSurface, readonly PanelKind[]> = {
  board: ["chat"],
  side: ["browser", "terminal"],
  bottom: ["terminal", "browser"],
};

export const kindOfTab = (t: PanelTab): PanelKind => (t.kind === "browser" ? "browser" : t.kind === "terminal" ? "terminal" : "chat");

/** 保存した値を読む（知らない値は捨て、何もなければ欄の既定） */
export function decodeKinds(stored: readonly string[], surface: PanelSurface): readonly PanelKind[] {
  const kinds = PANEL_KINDS.filter((k) => stored.includes(k));
  return kinds.length > 0 ? kinds : DEFAULT_KINDS[surface];
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

/** 欄で表示するタブの種類（タブの列の「表示するタブ」で切り替え、欄ごとに覚える） */
export function usePanelKinds(surface: PanelSurface) {
  const [stored, setStored] = useSharedList(panelTabKindsKey(surface));
  const kinds = decodeKinds(stored, surface);
  return {
    kinds,
    has: (kind: PanelKind) => kinds.includes(kind),
    toggle: (kind: PanelKind) => setStored([...toggleKind(kinds, kind)]),
    /** その種類を出す（隠している種類のタブを自分で開いたとき） */
    show: (kind: PanelKind) => {
      if (!kinds.includes(kind)) setStored([...toggleKind(kinds, kind)]);
    },
  };
}
