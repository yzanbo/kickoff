import { useSetting } from "@/hooks/useSetting";
import { readSetting, writeSetting } from "@/lib/storage";
import { panelTabKinds } from "@/lib/storageKeys";
import type { PaneLeaf } from "@/features/panel/layout/paneTree";
import { SURFACES, type PanelSurface } from "@/features/panel/surfaces";

/**
 * 欄に出すタブの種類（チャットには、新しいチャットのタブも入る。サブエージェント・ファイルはチャットの画面の右の欄だけに出す種類）
 */
export type PanelKind = "chat" | "browser" | "terminal" | "subagent" | "file";
/** 「表示するタブ」で付け外しできる種類（右の欄は出す種類が決まっているので入れない） */
export const PANEL_KINDS: readonly PanelKind[] = ["chat", "browser", "terminal"];
export const PANEL_KIND_LABELS: Record<PanelKind, string> = { chat: "チャット", browser: "ブラウザ", terminal: "ターミナル", subagent: "サブエージェント", file: "ファイル" };

/** 保存した値を読む（知らない値は捨て、何もなければ欄の既定 SURFACES の defaultKinds。出す種類が決まっている欄はいつも既定） */
export function decodeKinds(stored: readonly string[], surface: PanelSurface): readonly PanelKind[] {
  if (SURFACES[surface].fixedKinds) return SURFACES[surface].defaultKinds;
  const kinds = PANEL_KINDS.filter((k) => stored.includes(k));
  return kinds.length > 0 ? kinds : SURFACES[surface].defaultKinds;
}

/** チャットを出さない欄（全プロジェクトの画面のフッター・チャット欄）で付け外しできる種類 */
const CHAT_FREE_KINDS: readonly PanelKind[] = PANEL_KINDS.filter((k) => k !== "chat");

/**
 * チャットを出さない欄（noChat）で見せる種類: チャットを除く（覚えた選び方は書き換えず、プロジェクトの画面ではそのまま使う）。
 * チャットだけを選んでいたら、ターミナルとブラウザを出す
 */
export function withoutChat(kinds: readonly PanelKind[], noChat: boolean): readonly PanelKind[] {
  if (!noChat || !kinds.includes("chat")) return kinds;
  const rest = kinds.filter((k) => k !== "chat");
  return rest.length > 0 ? rest : CHAT_FREE_KINDS;
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

/** 欄でいま見せている種類（React の外からも読む。noChat: チャットを出さない欄） */
export const readKinds = (surface: PanelSurface, noChat = false): readonly PanelKind[] => withoutChat(decodeKinds(readSetting(panelTabKinds(surface)), surface), noChat);

/** その種類を出す（隠している種類のタブを自分で開いたとき） */
export function showKind(surface: PanelSurface, kind: PanelKind) {
  const kinds = readKinds(surface);
  if (!kinds.includes(kind)) writeSetting(panelTabKinds(surface), [...toggleKind(kinds, kind)]);
}

/**
 * 欄で表示するタブの種類（タブの列の「表示するタブ」で切り替え、欄ごとに覚える）。
 * noChat: チャットを出さない欄（全プロジェクトの画面のフッター・チャット欄。チャットはそのプロジェクトへ移って開く）。チャットは付け外しの一覧にも出さない
 */
export function usePanelKinds(surface: PanelSurface, noChat = false) {
  const [stored, setStored] = useSetting(panelTabKinds(surface));
  const all = decodeKinds(stored, surface);
  const kinds = withoutChat(all, noChat);
  return {
    kinds,
    /** 付け外しできる種類 */
    choices: noChat ? CHAT_FREE_KINDS : PANEL_KINDS,
    has: (kind: PanelKind) => kinds.includes(kind),
    toggle: (kind: PanelKind) => {
      // 見せている最後の 1 つは外さない（チャットを出さない欄では、隠しているチャットを数えない）
      if (noChat && (kind === "chat" || (kinds.length === 1 && kinds[0] === kind))) return;
      setStored([...toggleKind(all, kind)]);
    },
  };
}
