// プロジェクトの設定の PUT の zod（表は @shared/projects/settings）
import { z } from "zod";
import { defineSettingSchemas } from "@/foundation/core/settings/defineSettingSchemas";
import { projectSettings } from "@shared/projects/settings";

export const projectSettingSchemas = defineSettingSchemas(projectSettings, {
  projects_dir: z.string().min(1).max(500),
});
