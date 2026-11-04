import { useEffect, useState } from "react";
import { EFFORT_LABELS, PERMISSION_LABELS, type AppSettings, type EffortLevel, type PermissionMode, type Project, type ChatOptionsPatch } from "@shared/types";
import { api } from "@/api";
import { useAsync } from "@/hooks/useAsync";
import { useSave } from "@/hooks/useSave";
import { modelDisplayName } from "@/features/chat/options/models";
import { EFFORT_UNSET_LABEL, EffortOptions, ModelOptions, PermissionOptions } from "@/features/chat/options/AiOptions";
import { Field } from "@/ui/Field";
import { SaveActions } from "@/ui/SaveActions";

/** 「アプリの設定に従う」を表す select の値 */
const INHERIT = "__inherit__";

export function AiDefaults({ project, app }: { project: Project; app: AppSettings | undefined }) {
  const models = useAsync(() => api.models("claude"));
  const [draft, setDraft] = useState<ChatOptionsPatch>(project.chat_defaults);
  const save = useSave();
  useEffect(() => setDraft(project.chat_defaults), [project.chat_defaults]);

  /** キーを消すと、アプリの設定に従う */
  const set = <K extends keyof ChatOptionsPatch>(key: K, value: ChatOptionsPatch[K] | typeof INHERIT) => {
    const next = { ...draft };
    if (value === INHERIT) delete next[key];
    else next[key] = value as ChatOptionsPatch[K];
    setDraft(next);
  };
  const keys = ["model", "effort", "permission_mode", "fast_mode"] as const;
  const dirty = keys.some((k) => JSON.stringify(draft[k]) !== JSON.stringify(project.chat_defaults[k]));
  const list = models.data ?? [];
  const currentModel = list.find((m) => m.value === (draft.model ?? app?.chat_defaults.model));

  // アプリの設定の値（「アプリの設定に従う」の横に出す）
  const appEffort = app ? (app.chat_defaults.effort ? EFFORT_LABELS[app.chat_defaults.effort] : EFFORT_UNSET_LABEL) : "…";
  const appPermission = app ? PERMISSION_LABELS[app.chat_defaults.permission_mode] : "…";

  return (
    <div className="ai-defaults">
      <h3>Claude Code の既定</h3>
      <p className="muted small">
        このプロジェクトの新しいチャットは、ここで決めた設定から始まります。「アプリの設定に従う」の項目は、設定画面の AI の既定を使います。
      </p>
      <div className="form">
        <Field label="モデル">
          <select value={draft.model ?? INHERIT} onChange={(e) => set("model", e.target.value)}>
            <option value={INHERIT}>アプリの設定に従う（{app ? modelDisplayName(list, app.chat_defaults.model ?? "") : "…"}）</option>
            <ModelOptions models={list} value={draft.model} />
          </select>
        </Field>
        <Field label="推論の深さ（effort）">
          <select
            value={draft.effort === undefined ? INHERIT : (draft.effort ?? "")}
            onChange={(e) => set("effort", e.target.value === INHERIT ? INHERIT : ((e.target.value || null) as EffortLevel | null))}
          >
            <option value={INHERIT}>アプリの設定に従う（{appEffort}）</option>
            <option value="">{EFFORT_UNSET_LABEL}</option>
            <EffortOptions model={currentModel} />
          </select>
        </Field>
        <Field label="権限モード">
          <select value={draft.permission_mode ?? INHERIT} onChange={(e) => set("permission_mode", e.target.value as PermissionMode | typeof INHERIT)}>
            <option value={INHERIT}>アプリの設定に従う（{appPermission}）</option>
            <PermissionOptions model={currentModel} />
          </select>
        </Field>
        <Field label="ファストモード">
          <select
            value={draft.fast_mode === undefined ? INHERIT : draft.fast_mode ? "on" : "off"}
            onChange={(e) => set("fast_mode", e.target.value === INHERIT ? INHERIT : e.target.value === "on")}
          >
            <option value={INHERIT}>アプリの設定に従う（{app ? (app.chat_defaults.fast_mode ? "使う" : "使わない") : "…"}）</option>
            <option value="on" disabled={currentModel ? !currentModel.supports_fast_mode : false}>
              使う{currentModel && !currentModel.supports_fast_mode ? "（このモデルは対応していません）" : ""}
            </option>
            <option value="off">使わない</option>
          </select>
        </Field>
        <SaveActions save={save} disabled={!dirty} onSave={() => api.updateProject(project.id, { chat_defaults: draft })} />
      </div>
    </div>
  );
}
