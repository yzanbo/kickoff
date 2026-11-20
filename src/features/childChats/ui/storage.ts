// childChats の画面の保存（キーは kickoff:childChats:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { choice, defineSettings } from "@/foundation/ui/storage";
import { HANDOFF_VIAS } from "@shared/chat/chatEvent";
import { HANDOFF_AFTERS } from "@shared/chat/handoff";

export const storage = defineSettings("childChats", {
  /**
   * 子チャットの「親チャットに追加」を押したときの渡し方（composer = 親の入力欄に入れる / send = 今すぐ送る / queue = 親の送信待ちに入れる。初めは入力欄。設定の「表示」）。
   * ▾ のメニューで、今回だけ別の渡し方を選べる
   */
  handBackVia: choice(HANDOFF_VIAS, "composer"),
  /**
   * 「親チャットに追加」で渡したあとの子チャット（keep = そのまま / archive = アーカイブ / delete = 削除。初めはそのまま。設定の「表示」）。
   * 渡せて、子が作業中でないときだけ。削除は今すぐ送る・送信待ちのときだけで、入力欄に入れたときはアーカイブにする（handoffAfterFor）。▾ で今回だけ選べる
   */
  handBackAfter: choice(HANDOFF_AFTERS, "keep"),
});
