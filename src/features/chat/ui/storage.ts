// chat の画面の保存（キーは kickoff:chat:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { choice, defineSettings } from "@/foundation/ui/storage";

export const storage = defineSettings("chat", {
  /** チャットの ✕ を押したときの扱い（ask = 毎回聞く / close = 表示だけ消す / archive = アーカイブ / delete = 削除） */
  closeAction: choice(["ask", "close", "archive", "delete"], "ask"),
  /** ほかのチャットが作業中の作業場所へ新しいチャットを送るとき（ask = 毎回聞く / here = このまま送る / worktree = 新しいワークツリーで始める。features/worktree/busyWorkplace.ts） */
  busyWorkplaceAction: choice(["ask", "here", "worktree"], "ask"),
  /**
   * 子チャットを作ったときの開き方（side = 右の欄で開く / window = 別ウィンドウで開く / none = 開かない。初めは右の欄。設定の「表示」は childChats が描く）。
   * チャット欄の「新規の子チャットに送る」・「新しい子チャットで聞く」の画面・送信待ちの「子チャットで開く / 移す」で共通（別ウィンドウを開けないブラウザでは右の欄）
   */
  childOpenOnCreate: choice(["side", "window", "none"], "side"),
  /** サブエージェントを押したときに開く場所（inline = メインの流れの中のカードを開く / side = チャットの画面の右の欄 / window = 別ウィンドウ。初めは右の欄。設定の「表示」と、ピルの一覧の上でも変えられる） */
  subagentOpenIn: choice(["inline", "side", "window"], "side"),
  /** 子チャットを開く場所（side = いちばん上の親のチャットの画面の右の欄のタブ / window = 別ウィンドウ。設定の「表示」。別ウィンドウを開けない（スマホのブラウザ）なら右の欄） */
  childOpenIn: choice(["side", "window"], "side"),
});
