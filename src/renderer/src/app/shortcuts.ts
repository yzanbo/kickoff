import { focusChatComposer } from "@/features/chat/composer/composerKeys";
import { useWindowEvent } from "@/hooks/useWindowEvent";

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
 * ⌘⇧F チャットの中の文言を全文検索 / ⌘N / ⌘T 今のプロジェクトで新しいチャット（プロジェクト外なら新しいプロジェクト。⌘T はブラウザの「新しいタブ」と同じ手の動き。チャットは右のパネルのタブで開く） /
 * ⌘, 設定（Mac の環境設定と同じ）/ ⌘⇧A 作業中・回答待ち・未読のチャットの一覧（Chrome の「タブを検索」と同じキー）/
 * ⌘L チャット欄にピントを移す（ピントのあるパネルのチャット欄を優先）
 */
export function useAppShortcuts(actions: Actions) {
  useWindowEvent("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
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
