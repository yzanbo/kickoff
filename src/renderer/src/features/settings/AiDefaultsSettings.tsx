import { OTHER_PROVIDER_IDS, PROVIDER_IDS, PROVIDER_LABELS, type EffortLevel, type PermissionMode, type ProviderId } from "@shared/types";
import { useModels, useProviders } from "@/stores/providers";
import { providerPickBlock, statusOf } from "@/features/chat/provider/providerChoice";
import { ProviderIcon } from "@/features/chat/provider/ProviderIcon";
import { EFFORT_UNSET_LABEL, EffortOptions, ModelOptions, PermissionOptions } from "@/features/chat/options/AiOptions";
import { CheckField, Field } from "@/ui/Field";
import { SaveActions } from "@/ui/SaveActions";
import { ProviderDefaultsFields } from "./ProviderDefaultsFields";
import { useSettingsDraft } from "./useSettingsDraft";

/**
 * 設定: 新しいプロジェクトで使う AI と、AI ごとの新しいチャットの既定（モデル・推論の深さ・権限モード・ファストモード）。
 * Claude Code のほかの AI は、Kickoff のチャットで使えるもの（implemented）だけ出す（メモの仕様書「0028」の 9 節）
 */
export function AiDefaultsSettings() {
  const { draft, setDraft, dirty, save, saveFields } = useSettingsDraft();
  const models = useModels("claude");
  const statuses = useProviders().data;
  if (!draft) return null;
  const others = OTHER_PROVIDER_IDS.filter((id) => statusOf(statuses, id)?.implemented);
  const defaults = draft.chat_defaults;
  /** 既定の選択の 1 項目を変える（保存するまでは下書き） */
  const setDefault = (patch: Partial<typeof defaults>) => setDraft({ ...draft, chat_defaults: { ...defaults, ...patch } });
  const currentModel = models.find((m) => m.value === defaults.model);
  return (
    <section className="section ai-defaults-settings">
      <div className="ai-defaults-intro">
        <h2>AI の既定</h2>
        <p>新しいプロジェクトとチャットで、はじめに使う AI の設定です。</p>
        <p className="ai-defaults-scope">プロジェクトごとに設定を変えられます。チャット欄での変更は、そのチャットだけに適用されます。</p>
      </div>
      <div className="ai-defaults-project">
        <div className="ai-defaults-project-copy">
          <h3>新しいプロジェクト</h3>
          <p>新しく作成・取り込みするプロジェクトに適用します。</p>
        </div>
        <div className="form">
        <Field
            label="新しいプロジェクトで使う AI"
            help="プロジェクトの作成後も、そのプロジェクトの設定から変更できます。"
          >
            <select value={draft.default_provider} onChange={(e) => setDraft({ ...draft, default_provider: e.target.value as ProviderId })}>
              {PROVIDER_IDS.map((id) => {
                const blocked = id === draft.default_provider ? null : providerPickBlock(id, statusOf(statuses, id));
                return (
                  <option key={id} value={id} disabled={blocked !== null}>
                    {PROVIDER_LABELS[id]}
                    {blocked ? `（${blocked}）` : ""}
                  </option>
                );
              })}
            </select>
          </Field>
        </div>
      </div>
      <div className="ai-defaults-heading">
        <h3>新しいチャット</h3>
        <p>AI ごとに、チャットを始めるときの設定を決めます。</p>
      </div>
      <div className="ai-defaults-cards">
      <section className="ai-defaults-card" aria-labelledby="ai-defaults-claude-title">
        <div className="ai-defaults-card-head">
          <span className="ai-defaults-card-icon"><ProviderIcon provider="claude" size={18} /></span>
          <div><h3 id="ai-defaults-claude-title">{PROVIDER_LABELS.claude}</h3><p>Claude Code のチャットに適用</p></div>
        </div>
      <div className="form ai-defaults-card-form">
        <div className="ai-defaults-grid">
        <Field label="モデル">
          <select value={defaults.model ?? ""} onChange={(e) => setDefault({ model: e.target.value })}>
            <ModelOptions models={models} value={defaults.model} />
          </select>
        </Field>
        <Field label="推論の深さ（effort）">
          <select
            value={defaults.effort ?? ""}
            onChange={(e) => setDefault({ effort: (e.target.value || null) as EffortLevel | null })}
          >
            <option value="">{EFFORT_UNSET_LABEL}</option>
            <EffortOptions model={currentModel} />
          </select>
        </Field>
        <Field label="権限モード" help="参照資料への書き込みは、どのモードでも断ります。">
          <select value={defaults.permission_mode} onChange={(e) => setDefault({ permission_mode: e.target.value as PermissionMode })}>
            <PermissionOptions model={currentModel} />
          </select>
        </Field>
        </div>
        <CheckField
          className="ai-defaults-fast"
          label="ファストモードを使う"
          help={
            <>
              応答が速くなる代わりに、Claude のプランの追加の使用枠（extra usage）から消費されます。追加の使用枠が無効な場合は通常の速度で動き、チャットに理由が表示されます。
              {currentModel?.supports_fast_mode === false && "（このモデルは対応していません）"}
              {currentModel?.supports_fast_mode === null && "（このモデルの対応状況を確認できません）"}
            </>
          }
          checked={defaults.fast_mode}
          disabled={currentModel ? !currentModel.supports_fast_mode : false}
          onChange={(on) => setDefault({ fast_mode: on })}
        />
      </div>
      </section>
      {others.map((id) => (
        <ProviderDefaultsFields
          key={id}
          provider={id}
          value={draft.provider_chat_defaults[id]}
          onChange={(next) => setDraft({ ...draft, provider_chat_defaults: { ...draft.provider_chat_defaults, [id]: next } })}
        />
      ))}
      </div>
      <SaveActions
        save={save}
        disabled={!dirty}
        onSave={() => saveFields({ default_provider: draft.default_provider, chat_defaults: defaults, provider_chat_defaults: draft.provider_chat_defaults })}
      />
    </section>
  );
}
