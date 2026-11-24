// 通知の設定の PUT の zod（表は @shared/notifications/settings）
import { z } from "zod";
import { defineSettingSchemas } from "@/foundation/core/settings/defineSettingSchemas";
import { notificationSettings } from "@shared/notifications/settings";

export const notificationSettingSchemas = defineSettingSchemas(notificationSettings, {
  desktop_notifications: z.boolean(),
  dock_badge: z.boolean(),
});
