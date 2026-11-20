// 守りの設定の PUT の zod（表は @shared/guard/settings）
import { z } from "zod";
import { defineSettingSchemas } from "@/foundation/core/settings/defineSettingSchemas";
import { guardSettings } from "@shared/guard/settings";

export const guardSettingSchemas = defineSettingSchemas(guardSettings, {
  sandbox_enabled_by_default: z.boolean(),
  edit_scope_enabled_by_default: z.boolean(),
});
