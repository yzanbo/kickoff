// 画面の土台の保存（まとまりの開閉・検索の欄の探し方・差分の表示のしかた。どの機能からも共通の部品で読む）
import { choice, defineSettings, family, flag, optionalFlag } from "@/foundation/ui/storage";

export const storage = defineSettings("ui", {
  /**
   * まとまりを開いているか（hooks/useFold。サイドバーのプロジェクト・固定・グループ・グループなし・並べ方のまとまり・アーカイブ済み、
   * ボードの段・列のアーカイブ済み、パネルのタブのまとまり）。ID は <場所>:<まとまりのキー>（chatList の bucketChats のキー。
   * 例 "sidebar:p3"・"sidebar:p3/g5/status:read"・"board:kanban:3:p3/w:main"・"panel:p3/archived"）。
   * "1" = 開いている / "0" = 閉じている。覚えていなければ、まとまりごとの初めの値（アーカイブ済みは閉じる・ほかは開く）
   */
  fold: family(optionalFlag(), { ids: true }),
  /**
   * ⌘F の検索の欄の探し方（大文字・小文字を区別・単語単位・正規表現。VS Code の「Aa」「ab」「.*」）。チャット・ファイル・差分・ノート・履歴など、
   * どの検索の欄でも同じ値を使う（hooks/useFindOptions）。大文字・小文字のキーは、チャットの中の検索だけにあったころの名前のまま
   */
  findCase: flag(),
  findWholeWord: flag(),
  findRegex: flag(),
  /** 差分の並べ方（split = 左右に並べる / unified = 1 列） */
  diffLayout: choice(["split", "unified"], "unified"),
});
