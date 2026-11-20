// groups の画面の保存（キーは kickoff:groups:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { defineSettings, family, json } from "@/foundation/ui/storage";

export const storage = defineSettings("groups", {
  /**
   * プロジェクトごとの、グループの列（全プロジェクトのボード）・サイドバーの「No Group」の位置（グループの並びの中で、前にあるグループの数。ボードとリストで共通）。
   * -1（覚えていない）なら、ボードは先頭・リストはいちばん下
   */
  ungroupedAt: family(json((v) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : undefined), -1, (v) => v < 0), { ids: true }),
});
