// スマホ連携の設定の PUT の zod（表は @shared/devices/settings）
import { z } from "zod";
import { defineSettingSchemas } from "@/foundation/core/settings/defineSettingSchemas";
import { devicesSettings } from "@shared/devices/settings";

export const devicesSettingSchemas = defineSettingSchemas(devicesSettings, {
  remote_enabled: z.boolean(),
  // スマホ連携で端末がつなぐ先（http(s) の URL。null ならなし）
  mobile_url: z.url({ protocol: /^https?$/ }).max(500).nullable(),
});
