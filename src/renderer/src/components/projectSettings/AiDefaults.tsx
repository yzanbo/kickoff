import { useEffect, useState } from "react";
import { EFFORT_LABELS, PERMISSION_LABELS, type AppSettings, type EffortLevel, type PermissionChoice, type Project, type ProjectDefaults } from "../../../../core/types";
import { api, useAsync } from "../../api";
import { useSave } from "../../hooks/useSave";
import { modelDisplayName } from "../../models";
import { EffortOptions, ModelOptions, PermissionOptions } from "../AiOptions";
import { Field } from "../Field";
import { SaveActions } from "../SaveActions";

/** 「アプリの設定に従う」を表す select の値 */
const INHERIT = "__inherit__";

export function AiDefaults({ project, app }: { project: Project; app: AppSettings | undefined }) {
  const models = useAsync(() => api.models("claude"));
  const [draft, setDraft] = useState<ProjectDefaults>(project.defaults);
  const save = useSave();
  useEffect(() => setDraft(project.defaults), [project.defaults]);

  /** キーを消すと、アプリの設定に従う */
  const set = <K extends keyof ProjectDefaults>(key: K, value: ProjectDefaults[K] | typeof INHERIT) => {
    const next = { ...draft };
    if (value === INHERIT) delete next[key];
    else next[key] = value as ProjectDefaults[K];
    setDraft(next);
  };
  const keys = ["model", "effort", "permission", "fastMode"] as const;
  const dirty = keys.some((k) => JSON.stringify(draft[k]) !== JSON.stringify(project.defaults[k]));
  const list = models.data ?? [];
  const currentModel = list.find((m) => m.value === (draft.model ?? app?.claudeModel));

  // アプリの設定の値（「アプリの設定に従う」の横に出す）
  const appEffort = app ? (app.defaultEffort ? EFFORT_LABELS[app.defaultEffort] : "セクションに合わせる") : "…";
  const appPermission = app ? (app.defaultPermission === "phase" ? "セクションに合わせる" : PERMISSION_LABELS[app.defaultPermission]) : "…";

  return (
    <div className="ai-defaults">
      <h3>Claude Code の既定</h3>
      <p className="muted small">
        このプロジェクトの新しいチャットは、ここで決めた設定から始まります。「アプリの設定に従う」の項目は、設定画面の AI の既定を使います。
      </p>
      <div className="form">
        <Field label="モデル">
          <select value={draft.model ?? INHERIT} onChange={(e) => set("model", e.target.value)}>
            <option value={INHERIT}>アプリの設定に従う（{app ? modelDisplayName(list, app.claudeModel) : "…"}）</option>
            <ModelOptions models={list} value={draft.model} />
          </select>
        </Field>
        <Field label="推論の深さ（effort）">
          <select
            value={draft.effort === undefined ? INHERIT : (draft.effort ?? "")}
            onChange={(e) => set("effort", e.target.value === INHERIT ? INHERIT : ((e.target.value || null) as EffortLevel | null))}
          >
            <option value={INHERIT}>アプリの設定に従う（{appEffort}）</option>
            <option value="">セクションに合わせる</option>
            <EffortOptions model={currentModel} />
          </select>
        </Field>
        <Field label="権限モード">
          <select value={draft.permission ?? INHERIT} onChange={(e) => set("permission", e.target.value as PermissionChoice | typeof INHERIT)}>
            <option value={INHERIT}>アプリの設定に従う（{appPermission}）</option>
            <PermissionOptions model={currentModel} phaseLabel="セクションに合わせる" />
          </select>
        </Field>
        <Field label="ファストモード">
          <select
            value={draft.fastMode === undefined ? INHERIT : draft.fastMode ? "on" : "off"}
            onChange={(e) => set("fastMode", e.target.value === INHERIT ? INHERIT : e.target.value === "on")}
          >
            <option value={INHERIT}>アプリの設定に従う（{app ? (app.defaultFastMode ? "使う" : "使わない") : "…"}）</option>
            <option value="on" disabled={currentModel ? !currentModel.supportsFastMode : false}>
              使う{currentModel && !currentModel.supportsFastMode ? "（このモデルは対応していません）" : ""}
            </option>
            <option value="off">使わない</option>
          </select>
        </Field>
        <SaveActions save={save} disabled={!dirty} onSave={() => api.updateProject(project.id, { defaults: draft })} />
      </div>
    </div>
  );
}
