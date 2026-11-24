// プロジェクトの設定
import { setting, type SettingTable } from "@shared/foundation/contract/settings";

export const projectSettings = {
  /** 新規プロジェクトの保存先（前回使ったフォルダ） */
  projects_dir: setting({ default: "~/Documents" }),
} as const satisfies SettingTable;
