// AI ごとのチャットの既定の zod の形（アプリの設定・プロジェクトの既定で同じ）
import { z } from "zod";
import { EFFORT_LEVELS, PERMISSION_MODES, PROVIDER_IDS } from "@shared/settings/types";

/** チャットの選択の既定の 1 つ（モデルの null はその AI の既定） */
const chatOptionsDefaults = z.object({
  model: z.string().min(1).max(100).nullable(),
  effort: z.enum(EFFORT_LEVELS).nullable(),
  permission_mode: z.enum(PERMISSION_MODES),
  fast_mode: z.boolean(),
});
/** Claude Code はその AI の既定のモデルを持たないので、モデルを null にしない */
const claudeModelChosen = (defaults: Partial<Record<string, { model?: string | null }>>) => defaults.claude?.model !== null;
const CLAUDE_MODEL = "Claude Code の既定のモデルを選んでください";

/** AI ごとのチャットの既定（AI の ID → 選択）。アプリの設定は AI ごとに項目をすべて送る */
export const providerDefaultsSchema = z.partialRecord(z.enum(PROVIDER_IDS), chatOptionsDefaults).refine(claudeModelChosen, CLAUDE_MODEL);
/** プロジェクトのその AI のチャットの既定（書いた項目だけ。書いていない項目はアプリのその AI の既定に従う） */
export const projectAiDefaultsSchema = z
  .object({ provider: z.enum(PROVIDER_IDS), options: chatOptionsDefaults.partial().strict() })
  .refine((body) => claudeModelChosen({ [body.provider]: body.options }), CLAUDE_MODEL);
