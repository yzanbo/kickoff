import { focusChatComposer } from "@/features/chat/composer/composerKeys";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { hasAppModifier } from "@/lib/keys";
import { readSetting, writeSetting } from "@/lib/storage";
import { CHAT_HEADER_ROW_HIDDEN } from "@/lib/storageKeys";
import { runPageFind } from "@/ui/pageFind";

interface Actions {
  toggleSidebar: () => void;
  openPalette: () => void;
  openCodeSearch: () => void;
  newChat: () => void;
  openSettings: () => void;
  openActiveChats: () => void;
}

/**
 * アプリ全体のショートカット: ⌘B サイドバーの開閉 / ⌘K 検索・移動（ダイアログで全体を探す） / ⌘F 開いているページの中を探す（ブラウザと同じ。ページがなければボードのチャット名の検索欄） /
 * ⌘⇧F いまのプロジェクトの検索タブで、ファイルの中を探す欄にピントを置く（VS Code と同じ。利用者の依頼で、前はチャットの中の文言の全文検索。そちらはボードの検索欄の横のボタンと ⌘K の「チャット内の文言」から開く） / ⌘N / ⌘T 今のプロジェクトで新しいチャット（プロジェクトが 1 つもなければ、チャットはプロジェクトの中で始めることを案内して新しいプロジェクトへ誘う。⌘T はブラウザの「新しいタブ」と同じ手の動き。チャットは右のパネルのタブで開く） /
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
      // ⌘⇧F: いまのプロジェクトの検索タブで、ファイルの中を探す欄にピントを置く
      e.preventDefault();
      actions.openCodeSearch();
    } else if (e.key === "f") {
      // ⌘F: 開いているページの中を探す（利用者の依頼。全体を探すのは ⌘K のダイアログ）。ページ（ファイル・検索・変更の右側・履歴の詳細・メモ）が
      // 置いた検索を開き（ui/pageFind.ts）、なければボードのチャット名の検索欄へ。どちらもなければ何もしない（前は ⌘K の移動パネルを開いた）。
      // ピントがチャットの中にあるときはそのチャットの中の検索（chat/find/ChatFind.tsx）、チャットの画面の右の欄ではそのタブの中の検索
      // （panel/agents/AgentPanelFind.tsx）が先に受け取る。エディタ（Monaco・CodeMirror）の中なら、エディタが自分の検索を開く（上の defaultPrevented）
      e.preventDefault();
      if (runPageFind()) return;
      const boardSearch = document.querySelector<HTMLInputElement>("main .board-search input");
      boardSearch?.focus();
      boardSearch?.select();
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
