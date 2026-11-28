// 更新の設定（読むのはメインの更新の仕組み。コアに RPC の updates.settings で聞く）
import { setting, type SettingTable } from "@shared/foundation/contract/settings";

export const updateSettings = {
  /** 起動して少しあとと 1 時間ごとに新しい版を確かめる（切っても、メニューの「アップデートを確認…」からは確かめられる） */
  auto_check_updates: setting({ default: true }),
  /** 「この版は飛ばす」を選んだ版（null は飛ばしていない。効くのはその版だけで、次の版にはまた印が付く） */
  skipped_update_version: setting<string | null>({ default: null }),
} as const satisfies SettingTable;
