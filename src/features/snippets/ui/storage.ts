// snippets の画面の保存（キーは kickoff:snippets:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { defineSettings, flag } from "@/foundation/ui/storage";

export const storage = defineSettings("snippets", {
  /** 入力欄の上の定型文の帯を出さないか（設定の「表示」・タブの列の「表示」・帯の右クリック。どのチャットでも同じ。初めは出す） */
  barHidden: flag(false),
});
