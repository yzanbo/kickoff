// subagents の画面の保存（キーは kickoff:subagents:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { choice, defineSettings, family, list, text } from "@/foundation/ui/storage";

export const storage = defineSettings("subagents", {
  /** サブエージェントに伝える入力欄の書きかけの文（キーは「チャット:サブエージェントの行のキー」。カードの「伝える」と右の欄の画面で共通。送った・空にしたら消す） */
  tellDraft: family(text(), { ids: true }),
  /**
   * サブエージェントへの入力欄の送り先（relay = メインエージェント経由で SendMessage で伝える / child = 会話の記録を添えた子チャットで聞く。
   * カードの「伝える」と右の欄の画面で共通。最後に選んだ方を覚える）
   */
  askMode: choice(["relay", "child"], "relay"),
  /** チャットごとの、アーカイブしたサブエージェント（呼び出し ID） */
  archived: family(list(), { ids: true }),
});
