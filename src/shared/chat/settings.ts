// チャットの設定（自動のアーカイブ・つながったら再開）
import { setting, type SettingTable } from "@shared/foundation/contract/settings";

export const chatSettings = {
  /** 完了したチャットを、この日数がたったら自動でアーカイブする（null ならしない） */
  auto_archive_days: setting<number | null>({ default: null }),
  /** 通信が切れて止まったチャットを、つながったら自動で再開するか（何度か続かなければ、再開するかを聞く） */
  auto_resume_on_reconnect: setting({ default: true }),
} as const satisfies SettingTable;
