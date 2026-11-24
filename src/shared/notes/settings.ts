// ノートの設定
import { setting, type SettingTable } from "@shared/foundation/contract/settings";

export const noteSettings = {
  /** ノートの親フォルダ（この下にプロジェクトごとのフォルダを作る。null なら既定の ~/Documents/kickoff。開発版は kickoff-dev） */
  notes_dir: setting<string | null>({ default: null }),
} as const satisfies SettingTable;
