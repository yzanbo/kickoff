// 全部の機能の設定の表の束ね（純粋。コア・画面・スマホが読む）。AppSettings・SettingsPatch の形はここで足す
import { type SettingsOf, type SettingsPatchOf, type SettingTable } from "@shared/foundation/contract/settings";
import { aiSettings } from "@shared/ai/settings";
import { guardSettings } from "@shared/guard/settings";
import { devicesSettings } from "@shared/devices/settings";
import { notificationSettings } from "@shared/notifications/settings";
import { projectSettings } from "@shared/projects/settings";
import { chatSettings } from "@shared/chat/settings";
import { voiceSettings } from "@shared/voice/settings";
import { noteSettings } from "@shared/notes/settings";
import { compactSettings } from "@shared/compact/settings";
import { childChatSettings } from "@shared/childChats/settings";
import { remoteImageSettings } from "@shared/remoteImages/settings";

/** 全部の設定（並びは機能の順。GET /api/settings の項目の順もこれ） */
export const ALL_SETTINGS = {
  ...aiSettings,
  ...guardSettings,
  ...devicesSettings,
  ...notificationSettings,
  ...projectSettings,
  ...chatSettings,
  ...voiceSettings,
  ...noteSettings,
  ...compactSettings,
  ...childChatSettings,
  ...remoteImageSettings,
} as const satisfies SettingTable;

declare module "@shared/foundation/contract/settings" {
  interface AppSettings extends SettingsOf<typeof ALL_SETTINGS> {}
  interface SettingsPatch extends SettingsPatchOf<typeof ALL_SETTINGS> {}
}
