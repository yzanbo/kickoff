import type { EffortLevel, PermissionMode } from "@shared/types";
import { useModels } from "@/stores/providers";
import { modelDisplayName } from "@/features/chat/options/models";
import { EFFORT_UNSET_LABEL, EffortOptions, ModelOptions, PermissionOptions } from "@/features/chat/options/AiOptions";
import { Field } from "@/ui/Field";
import { SaveActions } from "@/ui/SaveActions";
import { useSettingsDraft } from "./useSettingsDraft";

/** 設定: 新しいチャットの AI の既定（モデル・推論の深さ・権限モード・ファストモード） */
export function AiDefaultsSettings() {
  const { draft, setDraft, dirty, save, saveFields } = useSettingsDraft();
  const models = useModels("claude");
  if (!draft) return null;
  const defaults = draft.chat_defaults;
  /** 既定の選択の 1 項目を変える（保存するまでは下書き） */
  const setDefault = (patch: Partial<typeof defaults>) => setDraft({ ...draft, chat_defaults: { ...defaults, ...patch } });
  const currentModel = models.find((m) => m.value === defaults.model);
  return (
    <section className="section">
      <h2>AI の既定</h2>
      <p className="muted small">新しいチャットはこの設定から始まります。チャット欄で変えた内容は、そのチャットだけに効きます。</p>
      <div className="form">
        <Field label={`モデル（${modelDisplayName(models, defaults.model ?? "")}）`}>
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
        <label className="check">
          <input
            type="checkbox"
            checked={defaults.fast_mode}
            disabled={currentModel ? !currentModel.supports_fast_mode : false}
            onChange={(e) => setDefault({ fast_mode: e.target.checked })}
          />
          <span>
            ファストモードを使う
            <span className="field-help">
              応答が速くなる代わりに、Claude のプランの追加の使用枠（extra usage）から消費されます。追加の使用枠が無効な場合は通常の速度で動き、チャットに理由が表示されます。
              {currentModel && !currentModel.supports_fast_mode && "（このモデルは対応していません）"}
            </span>
          </span>
        </label>
      </div>
      <SaveActions
        save={save}
        disabled={!dirty}
        onSave={() => saveFields({ chat_defaults: defaults })}
      />
    </section>
  );
}
