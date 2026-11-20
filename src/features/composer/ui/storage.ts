// composer の画面の保存（キーは kickoff:composer:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { choice, defineSettings } from "@/foundation/ui/storage";

export const storage = defineSettings("composer", {
  /** 作業中・送信待ちがあるときに送った指示の扱い（queue = あとで（送信待ちに足す）/ tell = いま（止めずに伝える）） */
  queueMode: choice(["queue", "tell"], "tell"),
});
