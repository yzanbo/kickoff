// タブの入れ物のウィンドウ間の知らせ（WindowMessageMap に足す。サイドバー・チャット欄の別ウィンドウとメインのウィンドウの間で、開け閉めを知らせ、パネルの状態を渡す・戻す）
import type { PanelState } from "./state/panelState";

declare module "@/foundation/ui/navigation/windowBus" {
  interface WindowMessageMap {
    /** サイドバーの別ウィンドウを開いた / 閉じた（開いている間、メインのウィンドウは画面と、種類の follow の写しを送る） */
    sidebarWindow: { open: boolean };
    /**
     * チャット欄の別ウィンドウを開いた / 閉じた（開いたら、メインのウィンドウはチャット欄の状態を取り出して sidePanels で渡し、自分のチャット欄を隠す。
     * holding: 別ウィンドウがもう状態を持っている（メインのウィンドウを読み込み直したとき。渡さずに、メインのウィンドウに戻した下書きの写しを捨てる））
     */
    sideWindow: { open: boolean; holding: boolean };
    /** メインのウィンドウから渡したチャット欄の状態（すべてのプロジェクトの分。タブの後始末はしていない。state/panelHandOff.ts） */
    sidePanels: { panels: [string, PanelState][] };
    /** メインのウィンドウから、チャット欄の別ウィンドウにブラウザのタブを開くよう頼む（ターミナルの ⌘ クリック・ポート・Docker などの「ブラウザで開く」） */
    sideOpenBrowser: { panel: string; url: string };
    /** タブ（ブラウザ・チャット）をほかのウィンドウへドラッグで移した（元の欄はそのタブを後始末なしで閉じる。layout/tabTransfer.ts） */
    tabMovedOut: { panel: string; key: string; dismiss: boolean };
    /** チャット欄の別ウィンドウから戻すチャット欄の状態（open: メインのウィンドウのチャット欄を開くか。戻し終えたら docked） */
    returnSidePanels: { panels: [string, PanelState][]; open: boolean };
  }
}
