// 通知の設定
import { setting, type SettingTable } from "@shared/foundation/contract/settings";

export const notificationSettings = {
  /** チャットの完了・失敗・回答待ちを Mac の通知で知らせる */
  desktop_notifications: setting({ default: true }),
  /** Dock の Kickoff のアイコンに、要対応（回答待ち・未読）のチャットの数を赤い数字で出す */
  dock_badge: setting({ default: true }),
} as const satisfies SettingTable;
