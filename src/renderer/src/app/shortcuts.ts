import { focusChatComposer } from "@/features/chat/composer/composerKeys";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { hasAppModifier } from "@/lib/keys";
import { readSetting, writeSetting } from "@/lib/storage";
import { CHAT_HEADER_ROW_HIDDEN } from "@/lib/storageKeys";

interface Actions {
  toggleSidebar: () => void;
  openPalette: () => void;
  openContentSearch: () => void;
  newChat: () => void;
  openSettings: () => void;
  openActiveChats: () => void;
}

/**
 * アプリ全体のショートカット: ⌘B サイドバーの開閉 / ⌘K 検索・移動 / ⌘F チャットを名前で探す /
 * ⌘⇧F チャットの中の文言を全文検索 / ⌘N / ⌘T 今のプロジェクトで新しいチャット（プロジェクトが 1 つもなければ、チャットはプロジェクトの中で始めることを案内して新しいプロジェクトへ誘う。⌘T はブラウザの「新しいタブ」と同じ手の動き。チャットは右のパネルのタブで開く） /
 * ⌘, 設定（Mac の環境設定と同じ）/ ⌘⇧A 作業中・回答待ち・未読のチャットの一覧（Chrome の「タブを検索」と同じキー）/
 * ⌘L チャット欄にピントを移す（ピントのあるパネルのチャット欄を優先）/
 * ⌥⌘T チャットの見出しの行の表示・非表示（Finder・Safari の「ツールバーを隠す」と同じキー。どのチャットでも共通）。
 * ⌘ は Mac のもので、ほかの OS（ブラウザから開いたとき）は Ctrl。Mac の Control 付き（⌃K など）は入力欄の編集に残し、ここでは受けない（hasAppModifier）
 */
export function useAppShortcuts(actions: Actions) {
  useWindowEvent("keydown", (e) => {
    // ⌥ を押すと文字が変わるので、キーの位置で見る
    if (e.metaKey && e.altKey && !e.ctrlKey && !e.shiftKey && e.code === "KeyT") {
      e.preventDefault();
      writeSetting(CHAT_HEADER_ROW_HIDDEN, !readSetting(CHAT_HEADER_ROW_HIDDEN));
      return;
    }
    // Mac は ⌘ だけ（⌃K・⌃F などは入力欄の編集のキーなので受けない）、ほかの OS（ブラウザから開いたとき）は Ctrl
    if (!hasAppModifier(e) || e.altKey) return;
    // エディタ（メモの CodeMirror・ファイルの Monaco）などが先に受け取ったキーは扱わない（その中の検索など）
    if (e.defaultPrevented) return;
    // Shift つきは ⌘⇧F と ⌘⇧A だけ受け付ける
    if (e.shiftKey && !["f", "a"].includes(e.key.toLowerCase())) return;
    if (e.shiftKey && e.key.toLowerCase() === "a") {
      e.preventDefault();
      actions.openActiveChats();
      return;
    }
    if (e.key === "b") {
      e.preventDefault();
      actions.toggleSidebar();
    } else if (e.key === "k") {
      e.preventDefault();
      actions.openPalette();
    } else if (e.key.toLowerCase() === "f" && e.shiftKey) {
      // ⌘⇧F: チャットの中の文言を全文検索（開いているチャット・プロジェクトに絞り込める）
      e.preventDefault();
      actions.openContentSearch();
    } else if (e.key === "f") {
      e.preventDefault();
      // ⌘F: チャットを名前で探す。ボードがあればその検索欄へ、なければ ⌘K の移動パネル（チャット名で探せる）。
      // ピントがチャットの中にあるときは、そのチャットの中の検索が先に受け取る（chat/find/ChatFind.tsx）
      const boardSearch = document.querySelector<HTMLInputElement>("main .board-search input");
      if (boardSearch) {
        boardSearch.focus();
        boardSearch.select();
      } else {
        actions.openPalette();
      }
    } else if (e.key === "n" || e.key === "t") {
      e.preventDefault();
      actions.newChat();
    } else if (e.key === "l" && e.metaKey) {
      if (focusChatComposer()) e.preventDefault();
    } else if (e.key === ",") {
      e.preventDefault();
      actions.openSettings();
    }
  });
}
