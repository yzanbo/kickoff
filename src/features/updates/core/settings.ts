// 更新の設定の PUT の zod（表は @shared/updates/settings）
import { z } from "zod";
import { defineSettingSchemas } from "@/foundation/core/settings/defineSettingSchemas";
import { updateSettings } from "@shared/updates/settings";

export const updateSettingSchemas = defineSettingSchemas(updateSettings, {
  auto_check_updates: z.boolean(),
  // 飛ばした版（semver の形だけを受ける。null で飛ばすのをやめる）
  skipped_update_version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/).nullable(),
});
