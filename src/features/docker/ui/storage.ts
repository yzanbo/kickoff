// docker の画面の保存（キーは kickoff:docker:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { defineSettings, flag, number } from "@/foundation/ui/storage";

export const storage = defineSettings("docker", {
  /** ログの画面の行の頭に時刻を出すか */
  logTimestamps: flag(true),
  /** ログの画面の長い行を折り返すか（折り返さなければ横にスクロール） */
  logWrap: flag(true),
  /** ログの画面の高さ（Docker タブの高さに対する %。一覧との境目のつまみで変える） */
  logHeight: number(55),
});
