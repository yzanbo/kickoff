// AI の設定の PUT の zod（表は @shared/ai/settings）
import { z } from "zod";
import { defineSettingSchemas } from "@/foundation/core/settings/defineSettingSchemas";
import { providerDefaultsSchema } from "@/foundation/core/http/schemas";
import { aiSettings } from "@shared/ai/settings";
import { PROVIDER_AUTH_MODES, PROVIDER_IDS } from "@shared/settings/types";

export const aiSettingSchemas = defineSettingSchemas(aiSettings, {
  default_provider: z.enum(PROVIDER_IDS),
  provider_auth: z.partialRecord(z.enum(PROVIDER_IDS), z.enum(PROVIDER_AUTH_MODES)),
  // AI ごとの既定（送った AI の分だけを置き換える。AI ごとに 4 つとも送る）
  provider_chat_defaults: providerDefaultsSchema,
});
