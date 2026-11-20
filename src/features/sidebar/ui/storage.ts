// sidebar の画面の保存（キーは kickoff:sidebar:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { choice, defineSettings, flag, namedViews, number, record, single, text } from "@/foundation/ui/storage";
import { DEFAULT_SIDEBAR_VIEWS } from "./initialViews";

export const storage = defineSettings("sidebar", {
  /** サイドバーを開いているか（"1" / "0"。起動直後の骨組み public/boot.js も同じキーと値を直接読む） */
  open: flag(true),
  width: number(294),
  /** プロジェクトの並べ方（stack = 縦並び / slide = 横スライド / rail = 縦スライド。初めは縦スライド） */
  layout: choice(["slide", "stack", "rail"], "rail"),
  /** しまった（アーカイブした）プロジェクトもサイドバーの下に出すか */
  showArchivedProjects: flag(),
  /** プロジェクトごとに最後に見ていた画面（URL のハッシュ。横スライドで戻ってきたときに開く。アプリを閉じるまで） */
  lastHashByProject: single(record((v): v is string => typeof v === "string"), { ids: true, session: true }),
  /** 要対応（回答待ち・未読）のチャットに目を向けるか（初めはオン = 一覧の上に × プロジェクト別） */
  waitingOnly: flag(true),
  /** 要対応がオンのときの表示（出し方 × 並べ方。filter = 要対応だけ × プロジェクト別 / list = 要対応だけ × 状態順 / inbox = 一覧の上に × 状態順 / inbox-project = 一覧の上に × プロジェクト別 / in-project = プロジェクト内の上に。sidebar/waitingAxes.ts。初めは inbox-project） */
  waitingView: choice(["filter", "inbox", "list", "inbox-project", "in-project"], "inbox-project"),
  savedViews: namedViews(DEFAULT_SIDEBAR_VIEWS),
  /**
   * 最後に選んだサイドバーのビュー（ID。⚙ の窓の「上書き」の先。まだ一度も選んでいなければ ""。そのときは最初のビュー（初めは標準）を当てる）
   */
  viewSelected: text(),
});
