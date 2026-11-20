// palette の画面の保存（キーは kickoff:palette:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { defineSettings, flag, list } from "@/foundation/ui/storage";

export const storage = defineSettings("palette", {
  /** ⌘K で探す対象（project / chat / note / message。空ならプロジェクト・チャット・ノート） */
  targets: list(),
  /** ⌘⇧A（作業中・待ちのチャットの一覧）に、アーカイブ済みのプロジェクトのチャットも出すか */
  activeShowArchivedProjects: flag(),
  /** ⌘⇧A の一覧で隠す状態（下書き・作業中・回答待ち・未読のうち、入力欄の下の行で外したもの。隠したものだけを覚える。palette/PaletteStateFilter） */
  activeHiddenStates: list(),
});
