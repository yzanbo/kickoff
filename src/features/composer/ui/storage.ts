// composer の画面の保存（キーは kickoff:composer:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { choice, defineSettings, family, json, single, text } from "@/foundation/ui/storage";
import { NO_ATTACHMENTS, NO_DRAFTS, parseAttachments, parseNewChatDrafts } from "./storedDrafts";

/** 前の保存の名前（tell / queue）も同じ扱いとして読む */
const LEGACY_WHEN: Readonly<Record<string, "now" | "later">> = { tell: "now", queue: "later" };
function sendWhen() {
  const shape = choice(["later", "now"], "now");
  return { ...shape, decode: (raw: string) => shape.decode(raw) ?? LEGACY_WHEN[raw] };
}

export const storage = defineSettings("composer", {
  /** 作業中・送信待ちがあるときに送った指示の扱い（コアの when と同じ名前。later = あとで（送信待ちに足す）/ now = いま（止めずに伝える）） */
  queueMode: sendWhen(),
  /** チャットごとの、入力欄の書きかけの文（空にした・送った・チャットを削除したら消す） */
  draft: family(text(), { ids: true }),
  /** チャットごとの、入力欄に添付して送る前のもの（アップロード済みの添付。外した・送った・チャットを削除したら消す。形の合わないものは捨てる） */
  attachments: family(json(parseAttachments, NO_ATTACHMENTS, (v) => v.length === 0), { ids: true }),
  /** 送る前の新しいチャット（再起動しても残す。送った・閉じた・プロジェクトを消したら消す） */
  newChatDrafts: single(json(parseNewChatDrafts, NO_DRAFTS, (v) => v.length === 0), { ids: true }),
});
