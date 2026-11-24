// AI の既定の欄（ChatDefaultsFields・AiDefaultsSettings）の決め方のうち、店・部品を読まない純粋なもの
import { providerCan } from "@shared/ai/providers";
import type { ModelOption, ProviderStatus } from "@shared/ai/types";
import { EFFORT_LABELS, OTHER_PROVIDER_IDS, PERMISSION_LABELS, type ChatOptions, type ProviderId } from "@shared/settings/types";
import { modelDisplayName } from "@/features/ai/ui/options/models";
import { EFFORT_UNSET_LABEL, providerDefaultModelLabel } from "@/features/ai/ui/options/AiOptions";
import { statusOf } from "@/features/ai/ui/provider/providerChoice";

/** モデルの「その AI の既定」（null）を選べるか（Claude Code のほかの AI だけ） */
export const offersProviderDefaultModel = (provider: ProviderId): boolean => provider !== "claude";

/** ファストモードの、選んだモデルの対応の注記 */
export const fastNote = (model: ModelOption | undefined) =>
  model?.supports_fast_mode === false ? "（このモデルは対応していません）" : model?.supports_fast_mode === null ? "（このモデルの対応状況を確認できません）" : "";

/** ファストモードの欄を出すか（ファストモードを持つ AI か、モデルのどれかが対応している AI） */
export const showsFast = (provider: ProviderId, models: ModelOption[]) => providerCan(provider, "fast_mode") || models.some((m) => m.supports_fast_mode);

/** モデルの値に当たる一覧の項目（null はその AI の既定のモデル） */
export const modelOf = (models: ModelOption[], model: string | null | undefined) =>
  models.find((m) => m.value === model) ?? (model === null ? models.find((m) => m.is_default) : undefined);

/** 「アプリの設定に従う」の横に出すアプリの設定の値（inherit が null = 読み込み中は「…」） */
export function inheritLabels(provider: ProviderId, models: ModelOption[], inherit: ChatOptions | null) {
  if (!inherit) return { model: "…", effort: "…", permission: "…", fast: "…" };
  return {
    model: inherit.model === null ? providerDefaultModelLabel(provider, models) : modelDisplayName(models, inherit.model),
    effort: inherit.effort ? EFFORT_LABELS[inherit.effort] : EFFORT_UNSET_LABEL,
    permission: PERMISSION_LABELS[inherit.permission_mode],
    fast: inherit.fast_mode ? "使う" : "使わない",
  };
}

/** 新しいチャットの既定を並べる AI（Claude Code と、Kickoff のチャットで使える = implemented のほかの AI） */
export const defaultsCardProviders = (statuses: readonly ProviderStatus[] | undefined): ProviderId[] => [
  "claude",
  ...OTHER_PROVIDER_IDS.filter((id) => statusOf(statuses, id)?.implemented),
];
