// ノートの設定
import { setting, type SettingTable } from "@shared/foundation/contract/settings";

export const noteSettings = {
  /** ノートの親フォルダ（この下にプロジェクトごとのフォルダと、共通のチャットの作業フォルダ .common-work を作る。null なら既定の ~/Documents/kickoff。開発版は kickoff-dev） */
  notes_dir: setting<string | null>({ default: null }),
  /** 共通のノートのフォルダ（null なら親フォルダの下の _common。ノートのフォルダだけを決め、共通のチャットの作業フォルダは親フォルダに付いていく） */
  common_notes_dir: setting<string | null>({ default: null }),
} as const satisfies SettingTable;
