// 外のアプリの保存（外部のターミナル・ブラウザとして開くアプリ）
import { choice, defineSettings } from "@/foundation/ui/storage";
import { EXTERNAL_BROWSERS, EXTERNAL_TERMINALS } from "@shared/foundation/ipc";

export const storage = defineSettings("external", {
  /** 外部のターミナルとして開くアプリ（EXTERNAL_TERMINALS の id） */
  terminal: choice(EXTERNAL_TERMINALS.map((t) => t.id), "terminal"),
  /** 外部のブラウザとして開くアプリ（EXTERNAL_BROWSERS の id） */
  browser: choice(EXTERNAL_BROWSERS.map((b) => b.id), "chrome"),
});
