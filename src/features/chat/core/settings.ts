// チャットの設定の PUT の zod（表は @shared/chat/settings）
import { z } from "zod";
import { defineSettingSchemas } from "@/foundation/core/settings/defineSettingSchemas";
import { chatSettings } from "@shared/chat/settings";
import { READ_TIMINGS } from "@shared/chat/readTiming";

export const chatSettingSchemas = defineSettingSchemas(chatSettings, {
  auto_archive_days: z.number().int().min(1).max(365).nullable(),
  auto_resume_on_reconnect: z.boolean(),
  read_timing: z.enum(READ_TIMINGS),
});
