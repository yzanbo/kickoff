// chatList の画面の保存（キーは kickoff:chatList:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { choice, defineSettings, flag } from "@/foundation/ui/storage";

export const storage = defineSettings("chatList", {
  /** プロジェクトのカードを 1 行で出すか（名前だけにして、チャット数の行を隠す） */
  projectCompact: flag(),
  /** チャットのまとめ方（none = まとめない / group = グループ別 / worktree = 作業場所別。初めはまとめない） */
  sections: choice(["none", "group", "worktree"], "none"),
  /** チャットの並び順（recent = 最近動いた順 / status = 状態順） */
  order: choice(["recent", "status", "manual"], "recent"),
  /** チャットを 1 行で出すか（2 行目のブランチを隠す） */
  compact: flag(true),
  /** サイドバーにアーカイブ済みのチャットを出すか（パネルのタブは chatPanel:show-archived で別。ボードの絞り込み archiveFilter とは連動しない。初めは隠す） */
  showArchived: flag(false),
  /** グループ別・作業場所別のまとまりの見出しに色を付けるか（パネルのタブのまとまりと同じ色。初めは付ける。features/chatList/bucketHues.ts） */
  bucketColors: flag(true),
  /** カンバンのアーカイブでの絞り込み（all = すべて / active = 未アーカイブ / archived = アーカイブ済みだけ。サイドバーとは連動しない。初めは未アーカイブ） */
  archiveFilter: choice(["all", "active", "archived"], "active"),
});
