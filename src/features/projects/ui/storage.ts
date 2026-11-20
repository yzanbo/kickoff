// projects の画面の保存（キーは kickoff:projects:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { choice, defineSettings, family, flag, list, number, single, text } from "@/foundation/ui/storage";

export const storage = defineSettings("projects", {
  /** サイドバーで最後に選んでいたプロジェクトの ID（0 = まだない。⌘N の新しいチャットの作成先にも使う） */
  currentProject: single(number(0), { ids: true }),
  /** プロジェクトの並び順（manual = 手動 / recent = 最近動いた順。初めは最近動いた順） */
  listOrder: choice(["manual", "recent"], "recent"),
  /** プロジェクトのタグでの絞り込み（選んだタグ。"" はタグのないプロジェクト。空なら絞り込まない。サイドバー・全プロジェクトの画面・⌘⇧A で共通） */
  tagFilter: list(),
  // サイドバーのタグの行の並び（ドラッグで並べた順のタグの名前。並べていないタグは後ろに名前順。メニューのタグも同じ順）
  tagOrder: list(),
  /** プロジェクトの画面の見出しの行（名前・設定・状態ごとの数・一覧のボタン）の出し方（show = 表示 / hover = 上端に寄せたときだけ表示 / hide = 非表示。features/project/page/headerMode.ts） */
  headerMode: choice(["show", "hover", "hide"], "show"),
  /** プロジェクトの画面のタブの置き方（top = 見出しの下に横並び / side = 左に縦並び・アイコンだけ。設定の「表示」） */
  tabsLayout: choice(["top", "side"], "side"),
  /** プロジェクトのタブの並び（ドラッグで並べ替えたタブの名前の列。空なら初めの並び。features/project/page/tabOrder.ts） */
  tabOrder: list(),
  projectChatWidth: number(367),
  /** 右サイドバーを横幅いっぱい（左のサイドバーの右から画面の右端まで）に広げているか（タブの列の左端の切り替え。アプリ全体） */
  projectChatMaximized: flag(),
  /**
   * プロジェクトごとの、右サイドバーで見ている中身（右端のアイコンの列で切り替える。browser = ブラウザ、ほかはプロジェクトのタブと同じ画面。
   * メインのウィンドウと右サイドバーの別ウィンドウで同じ値を読む。features/panel/projectChat/sideView.ts）
   */
  sideView: family(choice(["browser", "notes", "files", "search", "changes", "history", "db", "docker", "github", "ci", "trash"], "browser"), { ids: true }),
  /** プロジェクトごとの、ファイルタブで見ている作業場所（ワークツリーのフォルダ。空なら本体） */
  workplace: family(text(), { ids: true }),
});
