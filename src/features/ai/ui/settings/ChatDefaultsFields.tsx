import { providerCan } from "@shared/ai/providers";
import { fastNote, inheritLabels, modelOf, offersProviderDefaultModel, showsFast } from "./chatDefaultsModel";
import type { ModelOption } from "@shared/ai/types";
import { type ChatOptions, type ChatOptionsPatch, type EffortLevel, type PermissionMode, type ProviderId } from "@shared/settings/types";
import { useModels } from "@/features/ai/ui/stores/providers";
import { EFFORT_UNSET_LABEL, EffortOptions, ModelOptions, PermissionOptions, providerDefaultModelLabel } from "@/features/ai/ui/options/AiOptions";
import { CheckField, Field } from "@/foundation/ui/kit/Field";

/** 「アプリの設定に従う」を表す select の値 */
const INHERIT = "__inherit__";
/** 「その AI の既定のモデル」（null）を表す select の値（Claude Code のほかの AI だけ） */
const PROVIDER_DEFAULT = "";

type ChatDefaultsFieldsProps =
  /** アプリの設定の AI の既定（項目をすべて持つ） */
  | { provider: ProviderId; value: ChatOptions; onChange: (next: ChatOptions) => void; inherit?: undefined }
  /** プロジェクトの AI の既定（書いた項目だけ。書いていない項目は inherit = アプリの設定のその AI の既定に従う。null は読み込み中） */
  | { provider: ProviderId; value: ChatOptionsPatch; onChange: (next: ChatOptionsPatch) => void; inherit: ChatOptions | null };

/**
 * AI の新しいチャットの既定の欄（モデル・推論の深さ・権限モード・ファストモード）。アプリの設定の「AI の既定」とプロジェクトの設定の「AI」が使う。
 * モデルの「その AI の既定」（null）は Claude Code のほかの AI だけ。ファストモードは Claude Code と、モデルのどれかが対応している AI だけ出す（Codex は持たない）
 */
export function ChatDefaultsFields(props: ChatDefaultsFieldsProps) {
  const models = useModels(props.provider);
  return props.inherit === undefined ? <AppFields {...props} models={models} /> : <InheritFields {...props} models={models} />;
}

function AppFields({ provider, value, onChange, models }: Extract<ChatDefaultsFieldsProps, { inherit?: undefined }> & { models: ModelOption[] }) {
  const claude = !offersProviderDefaultModel(provider);
  const set = (patch: Partial<ChatOptions>) => onChange({ ...value, ...patch });
  const currentModel = modelOf(models, value.model);
  return (
    <>
      <div className="ai-defaults-grid">
        <Field label="モデル">
          <select value={value.model ?? PROVIDER_DEFAULT} onChange={(e) => set({ model: claude ? e.target.value : e.target.value || null })}>
            {!claude && <option value={PROVIDER_DEFAULT}>{providerDefaultModelLabel(provider, models)}</option>}
            <ModelOptions models={models} value={value.model} />
          </select>
        </Field>
        <Field label="推論の深さ（effort）">
          <select value={value.effort ?? ""} onChange={(e) => set({ effort: (e.target.value || null) as EffortLevel | null })}>
            <option value="">{EFFORT_UNSET_LABEL}</option>
            <EffortOptions model={currentModel} />
          </select>
        </Field>
        <Field label="権限モード" help={claude ? "参照資料へのファイル編集ツールによる書き込みは、どのモードでも断ります。" : "参照資料への書き込みは、どのモードでも断ります。"}>
          <select value={value.permission_mode} onChange={(e) => set({ permission_mode: e.target.value as PermissionMode })}>
            <PermissionOptions model={currentModel} />
          </select>
        </Field>
      </div>
      {showsFast(provider, models) && (
        <CheckField
          className="ai-defaults-fast"
          label="ファストモードを使う"
          help={
            providerCan(provider, "fast_mode") ? (
              <>
                応答が速くなる代わりに、Claude のプランの追加の使用枠（extra usage）から消費されます。追加の使用枠が無効な場合は通常の速度で動き、チャットに理由が表示されます。
                {fastNote(currentModel)}
              </>
            ) : undefined
          }
          checked={value.fast_mode}
          disabled={currentModel ? !currentModel.supports_fast_mode : false}
          onChange={(on) => set({ fast_mode: on })}
        />
      )}
    </>
  );
}

function InheritFields({ provider, value, onChange, inherit, models }: Extract<ChatDefaultsFieldsProps, { inherit: ChatOptions | null }> & { models: ModelOption[] }) {
  /** キーを消すと、アプリの設定に従う */
  const set = <K extends keyof ChatOptionsPatch>(key: K, next: ChatOptionsPatch[K] | typeof INHERIT) => {
    const patch = { ...value };
    if (next === INHERIT) delete patch[key];
    else patch[key] = next as ChatOptionsPatch[K];
    onChange(patch);
  };
  const currentModel = modelOf(models, value.model === undefined ? inherit?.model : value.model);
  // アプリの設定の値（「アプリの設定に従う」の横に出す）
  const app = inheritLabels(provider, models, inherit);
  return (
    <>
      <Field label="モデル">
        <select
          value={value.model === undefined ? INHERIT : (value.model ?? PROVIDER_DEFAULT)}
          onChange={(e) => set("model", e.target.value === INHERIT ? INHERIT : e.target.value || null)}
        >
          <option value={INHERIT}>アプリの設定に従う（{app.model}）</option>
          {offersProviderDefaultModel(provider) && <option value={PROVIDER_DEFAULT}>{providerDefaultModelLabel(provider, models)}</option>}
          <ModelOptions models={models} value={value.model} />
        </select>
      </Field>
      <Field label="推論の深さ（effort）">
        <select
          value={value.effort === undefined ? INHERIT : (value.effort ?? "")}
          onChange={(e) => set("effort", e.target.value === INHERIT ? INHERIT : ((e.target.value || null) as EffortLevel | null))}
        >
          <option value={INHERIT}>アプリの設定に従う（{app.effort}）</option>
          <option value="">{EFFORT_UNSET_LABEL}</option>
          <EffortOptions model={currentModel} />
        </select>
      </Field>
      <Field label="権限モード">
        <select value={value.permission_mode ?? INHERIT} onChange={(e) => set("permission_mode", e.target.value as PermissionMode | typeof INHERIT)}>
          <option value={INHERIT}>アプリの設定に従う（{app.permission}）</option>
          <PermissionOptions model={currentModel} />
        </select>
      </Field>
      {showsFast(provider, models) && (
        <Field label="ファストモード">
          <select
            value={value.fast_mode === undefined ? INHERIT : value.fast_mode ? "on" : "off"}
            onChange={(e) => set("fast_mode", e.target.value === INHERIT ? INHERIT : e.target.value === "on")}
          >
            <option value={INHERIT}>アプリの設定に従う（{app.fast}）</option>
            <option value="on" disabled={currentModel ? !currentModel.supports_fast_mode : false}>
              使う{fastNote(currentModel)}
            </option>
            <option value="off">使わない</option>
          </select>
        </Field>
      )}
    </>
  );
}
