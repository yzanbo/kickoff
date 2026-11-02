import type { EffortLevel, PermissionChoice } from "../../../../core/types";
import { api } from "../../api";
import { useAsync } from "../../hooks/useAsync";
import { modelDisplayName } from "../../models";
import { EFFORT_UNSET_LABEL, EffortOptions, ModelOptions, PermissionOptions } from "../AiOptions";
import { Field } from "../Field";
import { SaveActions } from "../SaveActions";
import { useSettingsDraft } from "./useSettingsDraft";

/** 同時に実行するエージェント数の選択肢（ほかに「上限なし」） */
const CONCURRENCY_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8];

/** 設定: 新しいチャットの AI の既定（モデル・推論の深さ・権限モード・ファストモード）と、同時に実行するエージェント数 */
export function AiDefaultsSettings() {
  const { draft, setDraft, dirty, save, saveFields } = useSettingsDraft();
  const models = useAsync(() => api.models("claude"));
  if (!draft) return null;
  const currentModel = models.data?.find((m) => m.value === draft.claudeModel);
  return (
    <section className="section">
      <h2>AI の既定</h2>
      <p className="muted small">新しいチャットはこの設定から始まります。チャット欄で変えた内容は、そのチャットだけに効きます。</p>
      <div className="form">
        <Field label={`モデル（${modelDisplayName(models.data ?? [], draft.claudeModel)}）`}>
          <select value={draft.claudeModel} onChange={(e) => setDraft({ ...draft, claudeModel: e.target.value })}>
            <ModelOptions models={models.data ?? []} value={draft.claudeModel} />
          </select>
        </Field>
        <Field label="推論の深さ（effort）">
          <select
            value={draft.defaultEffort ?? ""}
            onChange={(e) => setDraft({ ...draft, defaultEffort: (e.target.value || null) as EffortLevel | null })}
          >
            <option value="">{EFFORT_UNSET_LABEL}</option>
            <EffortOptions model={currentModel} />
          </select>
        </Field>
        <Field label="権限モード" help="参照資料への書き込みは、どのモードでも断ります。">
          <select value={draft.defaultPermission} onChange={(e) => setDraft({ ...draft, defaultPermission: e.target.value as PermissionChoice })}>
            <PermissionOptions model={currentModel} />
          </select>
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.defaultFastMode}
            disabled={currentModel ? !currentModel.supportsFastMode : false}
            onChange={(e) => setDraft({ ...draft, defaultFastMode: e.target.checked })}
          />
          <span>
            ファストモードを使う
            <span className="field-help">
              応答が速くなる代わりに、Claude のプランの追加の使用枠（extra usage）から消費されます。追加の使用枠が無効な場合は通常の速度で動き、チャットに理由が表示されます。
              {currentModel && !currentModel.supportsFastMode && "（このモデルは対応していません）"}
            </span>
          </span>
        </label>
        <Field
          label="同時に実行するエージェント数"
          help="多いほど速く進みますが、プランの使用枠を早く消費します。上限なしにすると、順番待ちをせずにすべて同時に動かします。"
        >
          <select
            value={draft.maxConcurrentRuns ?? "none"}
            onChange={(e) => setDraft({ ...draft, maxConcurrentRuns: e.target.value === "none" ? null : Number(e.target.value) })}
          >
            {CONCURRENCY_CHOICES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value="none">上限なし</option>
          </select>
        </Field>
      </div>
      <SaveActions
        save={save}
        disabled={!dirty}
        onSave={() =>
          saveFields({
            claudeModel: draft.claudeModel,
            defaultEffort: draft.defaultEffort,
            defaultPermission: draft.defaultPermission,
            defaultFastMode: draft.defaultFastMode,
            maxConcurrentRuns: draft.maxConcurrentRuns,
          })
        }
      />
    </section>
  );
}
