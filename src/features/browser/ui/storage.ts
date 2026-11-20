// browser の画面の保存（キーは kickoff:browser:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { choice, defineSettings, number } from "@/foundation/ui/storage";

export const storage = defineSettings("browser", {
  /** 開発者ツールを出す場所（right / bottom / window = 別のウィンドウ） */
  devtoolsDock: choice(["right", "bottom", "window"], "window"),
  devtoolsWidth: number(420),
  devtoolsHeight: number(300),
});
