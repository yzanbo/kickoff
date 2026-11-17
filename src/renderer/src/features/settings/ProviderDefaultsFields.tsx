import { PROVIDER_BASE_CHAT_OPTIONS } from "@shared/chat/chatOptions";
import { PROVIDER_LABELS, type ChatOptions, type EffortLevel, type OtherProviderId, type PermissionMode } from "@shared/types";
import { useModels } from "@/stores/providers";
import { EFFORT_UNSET_LABEL, EffortOptions, ModelOptions, PermissionOptions, providerDefaultModelLabel } from "@/features/chat/options/AiOptions";
import { CheckField, Field } from "@/ui/Field";

/**
 * 設定の「AI の既定」の、Claude Code のほかの AI の新しいチャットの既定（メモの仕様書「0028」の 9 節）。
 * モデルは「その AI の既定」（null）か一覧のもの。ファストモードは、その AI のモデルのどれかが対応しているときだけ出す（Codex は持たない）
 */
export function ProviderDefaultsFields({ provider, value, onChange }: { provider: OtherProviderId; value: ChatOptions | undefined; onChange: (next: ChatOptions) => void }) {
  const models = useModels(provider);
  const defaults = value ?? PROVIDER_BASE_CHAT_OPTIONS;
  const set = (patch: Partial<ChatOptions>) => onChange({ ...defaults, ...patch });
  const currentModel = defaults.model === null ? models.find((m) => m.is_default) : models.find((m) => m.value === defaults.model);
  const hasFast = models.some((m) => m.supports_fast_mode);
  return (
    <>
      <h3>{PROVIDER_LABELS[provider]}</h3>
      <div className="form">
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
        {hasFast && (
          <CheckField
            label="ファストモードを使う"
            checked={defaults.fast_mode}
            disabled={currentModel ? !currentModel.supports_fast_mode : false}
            onChange={(on) => set({ fast_mode: on })}
          />
        )}
      </div>
    </>
  );
}
