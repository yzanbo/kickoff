// ノートの設定の PUT の zod（表は @shared/notes/settings）
import { z } from "zod";
import { defineSettingSchemas } from "@/foundation/core/settings/defineSettingSchemas";
import { ABSOLUTE_FOLDER, isAbsoluteFolder } from "@/foundation/core/http/schemas";
import { noteSettings } from "@shared/notes/settings";

export const noteSettingSchemas = defineSettingSchemas(noteSettings, {
  // ノートの親フォルダ（null なら既定の場所）
  notes_dir: z.string().trim().min(1).max(1000).refine(isAbsoluteFolder, ABSOLUTE_FOLDER).nullable(),
});
