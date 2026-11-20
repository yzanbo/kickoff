// chat の画面の保存（キーは kickoff:chat:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { choice, defineSettings } from "@/foundation/ui/storage";

export const storage = defineSettings("chat", {
  /** チャットの ✕ を押したときの扱い（ask = 毎回聞く / close = 表示だけ消す / archive = アーカイブ / delete = 削除） */
  closeAction: choice(["ask", "close", "archive", "delete"], "ask"),
  /** ほかのチャットが作業中の作業場所へ新しいチャットを送るとき（ask = 毎回聞く / here = このまま送る / worktree = 新しいワークツリーで始める。features/worktree/busyWorkplace.ts） */
  busyWorkplaceAction: choice(["ask", "here", "worktree"], "ask"),
});
