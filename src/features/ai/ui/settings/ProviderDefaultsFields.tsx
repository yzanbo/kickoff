import type { ChatOptions } from "@shared/chat/types";
import { PROVIDER_LABELS, type EffortLevel, type OtherProviderId, type PermissionMode } from "@shared/settings/types";
import { useModels } from "@/features/ai/ui/stores/providers";
import { ProviderIcon } from "@/features/ai/ui/provider/ProviderIcon";
import { EFFORT_UNSET_LABEL, EffortOptions, ModelOptions, PermissionOptions, providerDefaultModelLabel } from "@/features/ai/ui/options/AiOptions";
import { CheckField, Field } from "@/foundation/ui/kit/Field";

/**
 * 設定の「AI の既定」の、Claude Code のほかの AI の新しいチャットの既定。
 * モデルは「その AI の既定」（null）か一覧のもの。ファストモードは、その AI のモデルのどれかが対応しているときだけ出す（Codex は持たない）
 */
export function ProviderDefaultsFields({ provider, value: defaults, onChange }: { provider: OtherProviderId; value: ChatOptions; onChange: (next: ChatOptions) => void }) {
  const models = useModels(provider);
  const set = (patch: Partial<ChatOptions>) => onChange({ ...defaults, ...patch });
  const currentModel = defaults.model === null ? models.find((m) => m.is_default) : models.find((m) => m.value === defaults.model);
  const hasFast = models.some((m) => m.supports_fast_mode);
  return (
    <section className="ai-defaults-card" aria-labelledby={`ai-defaults-${provider}-title`}>
      <div className="ai-defaults-card-head">
        <span className="ai-defaults-card-icon"><ProviderIcon provider={provider} size={18} /></span>
        <div><h3 id={`ai-defaults-${provider}-title`}>{PROVIDER_LABELS[provider]}</h3><p>{PROVIDER_LABELS[provider]} のチャットに適用</p></div>
      </div>
      <div className="form ai-defaults-card-form">
        <div className="ai-defaults-grid">
        <Field label="モデル">
          <select value={defaults.model ?? ""} onChange={(e) => set({ model: e.target.value || null })}>
            <option value="">{providerDefaultModelLabel(provider, models)}</option>
            <ModelOptions models={models} value={defaults.model} />
          </select>
        </Field>
        <Field label="推論の深さ（effort）">
          <select value={defaults.effort ?? ""} onChange={(e) => set({ effort: (e.target.value || null) as EffortLevel | null })}>
            <option value="">{EFFORT_UNSET_LABEL}</option>
            <EffortOptions model={currentModel} />
          </select>
        </Field>
        <Field label="権限モード" help="参照資料への書き込みは、どのモードでも断ります。">
          <select value={defaults.permission_mode} onChange={(e) => set({ permission_mode: e.target.value as PermissionMode })}>
            <PermissionOptions model={currentModel} />
          </select>
        </Field>
        </div>
        {hasFast && (
          <CheckField
            className="ai-defaults-fast"
            label="ファストモードを使う"
            checked={defaults.fast_mode}
            disabled={currentModel ? !currentModel.supports_fast_mode : false}
            onChange={(on) => set({ fast_mode: on })}
          />
        )}
      </div>
    </section>
  );
}
