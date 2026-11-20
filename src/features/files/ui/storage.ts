// files の画面の保存（キーは kickoff:files:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { defineSettings, flag, list, number } from "@/foundation/ui/storage";

export const storage = defineSettings("files", {
  /** 検索タブの検索の履歴（新しい順。入力欄の ↑↓ でたどる。features/editor/useProjectSearch.ts） */
  searchHistory: list(),
  /** ファイルタブ・履歴タブの左の一覧の幅 */
  listWidth: number(246),
  /** ファイル・検索・変更のタブの左の一覧を隠しているか（3 つのタブで共通。どのプロジェクトでも同じ） */
  changesListHidden: flag(false),
  /** ファイルの中身（編集の部品・読むだけの表）を、横幅に入らない行で折り返すか（ファイルの見出しのボタン・エディタの中の ⌥Z で切り替える。初めは折り返さない） */
  wordWrap: flag(),
  /** Markdown・HTML のファイルを開いたとき、プレビューで出すか（ファイルの見出しの「プレビュー / コードを表示」で最後に選んだ方を覚える。初めはコード） */
  pagePreview: flag(),
});
