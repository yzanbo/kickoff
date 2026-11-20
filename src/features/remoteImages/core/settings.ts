// リンクの設定の PUT の zod（表は @shared/remoteImages/settings）
import { z } from "zod";
import { defineSettingSchemas } from "@/foundation/core/settings/defineSettingSchemas";
import { remoteImageSettings } from "@shared/remoteImages/settings";
import { LINK_OPEN_TARGETS, TRUSTED_LINK_DOMAINS_MAX } from "@shared/settings/types";

export const remoteImageSettingSchemas = defineSettingSchemas(remoteImageSettings, {
  // Markdown のリンクを開く先と、確認を省くドメイン（小文字にそろえ、重ねない）
  link_open_in: z.enum(LINK_OPEN_TARGETS),
  trusted_link_domains: z
    .array(z.string().trim().toLowerCase().min(1).max(253).regex(/^[a-z0-9.-]+$/))
    .max(TRUSTED_LINK_DOMAINS_MAX)
    .transform((list) => [...new Set(list)]),
});
