// チャットの設定（自動のアーカイブ・つながったら再開・既読にするタイミング）
import { setting, type SettingTable } from "@shared/foundation/contract/settings";
import type { ReadTiming } from "./readTiming";

export const chatSettings = {
  /** 完了したチャットを、この日数がたったら自動でアーカイブする（null ならしない） */
  auto_archive_days: setting<number | null>({ default: null }),
  /** 通信が切れて止まったチャットを、つながったら自動で再開するか（何度か続かなければ、再開するかを聞く） */
  auto_resume_on_reconnect: setting({ default: true }),
  /** 未読から既読に変えるタイミング（パソコンとスマホで同じ。コアに置くのはスマホも読むため） */
  read_timing: setting<ReadTiming>({ default: "at_bottom" }),
} as const satisfies SettingTable;
