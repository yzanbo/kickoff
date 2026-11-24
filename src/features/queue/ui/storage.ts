// queue の画面の保存（キーは kickoff:queue:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { defineSettings, flag, number } from "@/foundation/ui/storage";

export const storage = defineSettings("queue", {
  /** 送信待ちの一覧をたたんで 1 行にするか（どのチャットでも同じ） */
  collapsed: flag(true),
  /** 送信待ちの一覧を、中でスクロールさせずにすべて出すか（どのチャットでも同じ） */
  expanded: flag(),
  /** 送信待ちの一覧の高さの上限（px。上端のつまみのドラッグで変える。どのチャットでも同じ） */
  height: number(150),
});
