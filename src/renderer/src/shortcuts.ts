import { useWindowEvent } from "./hooks/useWindowEvent";

interface Actions {
  toggleSidebar: () => void;
  openPalette: () => void;
  openContentSearch: () => void;
  newChat: () => void;
}

/**
 * アプリ全体のショートカット: ⌘B サイドバーの開閉 / ⌘K 検索・移動 / ⌘F チャットを名前で探す /
 * ⌘⇧F チャットの中の文言を全文検索 / ⌘N 今のプロジェクトで新しいチャット（プロジェクト外なら新しいプロジェクト）
 */
export function useAppShortcuts(actions: Actions) {
  useWindowEvent("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    // Shift つきは ⌘⇧F だけ受け付ける
    if (e.shiftKey && e.key.toLowerCase() !== "f") return;
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
      // ⌘F: チャットを名前で探す。ボードがあればその検索欄へ、なければ ⌘K の移動パネル（チャット名で探せる）
      const boardSearch = document.querySelector<HTMLInputElement>("main .board-search input");
      if (boardSearch) {
        boardSearch.focus();
        boardSearch.select();
      } else {
        actions.openPalette();
      }
    } else if (e.key === "n") {
      e.preventDefault();
      actions.newChat();
    }
  });
}
