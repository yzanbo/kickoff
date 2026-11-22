// childChats の画面の保存（キーは kickoff:childChats:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { choice, defineSettings, family, json } from "@/foundation/ui/storage";
import { HANDOFF_VIAS, type HandoffFrom } from "@shared/chat/chatEvent";
import { HANDOFF_AFTERS } from "@shared/chat/handoff";

/** 保存した子チャットからの依頼の出どころを読む（形が合わなければ null） */
function parseHandoffFrom(value: unknown): HandoffFrom | null {
  if (typeof value !== "object" || value === null) return null;
  const { chat_id, title } = value as Record<string, unknown>;
  return typeof chat_id === "number" && typeof title === "string" ? { chat_id, title } : null;
}

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
  /**
   * 親チャットごとの、入力欄に入れた子チャットからの依頼の出どころ（「親チャットに追加」の入力欄。入力欄の上の札「子チャット『…』から」。
   * 送ると発言の handoff_from にして消す。× でも消す。null = なし）
   */
  handBackFrom: family(json(parseHandoffFrom, null, (v) => v === null), { ids: true }),
});
