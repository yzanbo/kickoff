// 全部の機能の設定の PUT の zod の束ね（設定のルートが .partial().strict() で受ける）。並びは @/app/shared/settings.ts の ALL_SETTINGS と同じ
import { aiSettingSchemas } from "@/features/ai/core/settings";
import { guardSettingSchemas } from "@/features/guard/core/settings";
import { devicesSettingSchemas } from "@/features/devices/core/settings";
import { notificationSettingSchemas } from "@/features/notifications/core/settings";
import { projectSettingSchemas } from "@/features/projects/core/settings";
import { chatSettingSchemas } from "@/features/chat/core/settings";
import { voiceSettingSchemas } from "@/features/voice/core/settings";
import { noteSettingSchemas } from "@/features/notes/core/settings";
import { compactSettingSchemas } from "@/features/compact/core/settings";
import { childChatSettingSchemas } from "@/features/childChats/core/settings";
import { remoteImageSettingSchemas } from "@/features/remoteImages/core/settings";
import { updateSettingSchemas } from "@/features/updates/core/settings";

export const SETTING_SCHEMAS = {
  ...aiSettingSchemas,
  ...guardSettingSchemas,
  ...devicesSettingSchemas,
  ...notificationSettingSchemas,
  ...projectSettingSchemas,
  ...chatSettingSchemas,
  ...voiceSettingSchemas,
  ...noteSettingSchemas,
  ...compactSettingSchemas,
  ...childChatSettingSchemas,
  ...remoteImageSettingSchemas,
  ...updateSettingSchemas,
};
