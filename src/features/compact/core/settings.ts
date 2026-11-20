// 圧縮の設定の PUT の zod（表は @shared/compact/settings）
import { z } from "zod";
import { defineSettingSchemas } from "@/foundation/core/settings/defineSettingSchemas";
import { compactPrompt } from "@/foundation/core/http/schemas";
import { AUTO_COMPACT_PCT_MAX, AUTO_COMPACT_PCT_MIN } from "@shared/compact/autoCompact";
import { compactSettings } from "@shared/compact/settings";

export const compactSettingSchemas = defineSettingSchemas(compactSettings, {
  // 自動圧縮を始める使用率（null なら Claude Code の既定）
  auto_compact_pct: z.number().int().min(AUTO_COMPACT_PCT_MIN).max(AUTO_COMPACT_PCT_MAX).nullable(),
  // 共通の圧縮前指示（null ならなし）
  pre_compact_prompt: compactPrompt,
  post_compact_prompt: compactPrompt,
  // 共通の圧縮前指示・圧縮後指示を送るか（オフでも文は残す）
  pre_compact_enabled: z.boolean(),
  post_compact_enabled: z.boolean(),
});
