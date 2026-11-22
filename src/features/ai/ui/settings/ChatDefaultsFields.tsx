import type { ModelOption } from "@shared/ai/types";
import { EFFORT_LABELS, PERMISSION_LABELS, type ChatOptions, type ChatOptionsPatch, type EffortLevel, type PermissionMode, type ProviderId } from "@shared/settings/types";
import { useModels } from "@/features/ai/ui/stores/providers";
import { modelDisplayName } from "@/features/ai/ui/options/models";
import { EFFORT_UNSET_LABEL, EffortOptions, ModelOptions, PermissionOptions, providerDefaultModelLabel } from "@/features/ai/ui/options/AiOptions";
import { CheckField, Field } from "@/foundation/ui/kit/Field";

/** 「アプリの設定に従う」を表す select の値 */
const INHERIT = "__inherit__";
/** 「その AI の既定のモデル」（null）を表す select の値（Claude Code のほかの AI だけ） */
const PROVIDER_DEFAULT = "";

/** ファストモードの、選んだモデルの対応の注記 */
const fastNote = (model: ModelOption | undefined) =>
  model?.supports_fast_mode === false ? "（このモデルは対応していません）" : model?.supports_fast_mode === null ? "（このモデルの対応状況を確認できません）" : "";

/** モデルの値に当たる一覧の項目（null はその AI の既定のモデル） */
const modelOf = (models: ModelOption[], model: string | null | undefined) => models.find((m) => m.value === model) ?? (model === null ? models.find((m) => m.is_default) : undefined);

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
  const claude = provider === "claude";
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
      {(claude || models.some((m) => m.supports_fast_mode)) && (
        <CheckField
          className="ai-defaults-fast"
          label="ファストモードを使う"
          help={
            claude ? (
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
  const appModel = !inherit ? "…" : inherit.model === null ? providerDefaultModelLabel(provider, models) : modelDisplayName(models, inherit.model);
  const appEffort = inherit ? (inherit.effort ? EFFORT_LABELS[inherit.effort] : EFFORT_UNSET_LABEL) : "…";
  const appPermission = inherit ? PERMISSION_LABELS[inherit.permission_mode] : "…";
  return (
    <>
      <Field label="モデル">
        <select
          value={value.model === undefined ? INHERIT : (value.model ?? PROVIDER_DEFAULT)}
          onChange={(e) => set("model", e.target.value === INHERIT ? INHERIT : e.target.value || null)}
        >
          <option value={INHERIT}>アプリの設定に従う（{appModel}）</option>
          {provider !== "claude" && <option value={PROVIDER_DEFAULT}>{providerDefaultModelLabel(provider, models)}</option>}
          <ModelOptions models={models} value={value.model} />
        </select>
      </Field>
      <Field label="推論の深さ（effort）">
        <select
          value={value.effort === undefined ? INHERIT : (value.effort ?? "")}
          onChange={(e) => set("effort", e.target.value === INHERIT ? INHERIT : ((e.target.value || null) as EffortLevel | null))}
        >
          <option value={INHERIT}>アプリの設定に従う（{appEffort}）</option>
          <option value="">{EFFORT_UNSET_LABEL}</option>
          <EffortOptions model={currentModel} />
        </select>
      </Field>
      <Field label="権限モード">
        <select value={value.permission_mode ?? INHERIT} onChange={(e) => set("permission_mode", e.target.value as PermissionMode | typeof INHERIT)}>
          <option value={INHERIT}>アプリの設定に従う（{appPermission}）</option>
          <PermissionOptions model={currentModel} />
        </select>
      </Field>
      {(provider === "claude" || models.some((m) => m.supports_fast_mode)) && (
        <Field label="ファストモード">
          <select
            value={value.fast_mode === undefined ? INHERIT : value.fast_mode ? "on" : "off"}
            onChange={(e) => set("fast_mode", e.target.value === INHERIT ? INHERIT : e.target.value === "on")}
          >
            <option value={INHERIT}>アプリの設定に従う（{inherit ? (inherit.fast_mode ? "使う" : "使わない") : "…"}）</option>
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
