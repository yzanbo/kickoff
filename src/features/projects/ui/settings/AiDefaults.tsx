import { useEffect, useState } from "react";
import { appChatDefaults } from "@shared/ai/chatOptions";
import type { ChatOptionsPatch } from "@shared/settings/types";
import type { Project } from "@shared/projects/types";
import { EFFORT_LABELS, PERMISSION_LABELS, PROVIDER_LABELS, type EffortLevel, type PermissionMode, type ProviderId } from "@shared/settings/types";
import type { AppSettings } from "@shared/foundation/contract/settings";
import { api } from "@/foundation/ui/api";
import { useModels } from "@/features/ai/ui/stores/providers";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { modelDisplayName } from "@/features/ai/ui/options/models";
import { EFFORT_UNSET_LABEL, EffortOptions, ModelOptions, PermissionOptions, providerDefaultModelLabel } from "@/features/ai/ui/options/AiOptions";
import { Field } from "@/foundation/ui/kit/Field";
import { SaveActions } from "@/foundation/ui/kit/SaveActions";

/** 「アプリの設定に従う」を表す select の値 */
const INHERIT = "__inherit__";
/** 「その AI の既定のモデル」（null）を表す select の値（Claude Code のほかの AI だけ） */
const PROVIDER_DEFAULT = "";

/** このプロジェクトのその AI の既定 */
const projectPatchOf = (project: Project, provider: ProviderId): ChatOptionsPatch => project.provider_chat_defaults[provider] ?? {};

/** プロジェクトの設定の「AI」: このプロジェクトの AI（provider）の新しいチャットの既定。書いていない項目はアプリの設定のその AI の既定に従う */
export function AiDefaults({ project, provider, app }: { project: Project; provider: ProviderId; app: AppSettings | undefined }) {
  const models = useModels(provider);
  const saved = projectPatchOf(project, provider);
  const [draft, setDraft] = useState<ChatOptionsPatch>(saved);
  const save = useAction<"save">();
  const savedKey = JSON.stringify(saved);
  // 保存した値が変わったら（ほかの窓・AI を替えた）下書きを取り直す
  useEffect(() => setDraft(JSON.parse(savedKey) as ChatOptionsPatch), [savedKey]);

  /** キーを消すと、アプリの設定に従う */
  const set = <K extends keyof ChatOptionsPatch>(key: K, value: ChatOptionsPatch[K] | typeof INHERIT) => {
    const next = { ...draft };
    if (value === INHERIT) delete next[key];
    else next[key] = value as ChatOptionsPatch[K];
    setDraft(next);
  };
  const keys = ["model", "effort", "permission_mode", "fast_mode"] as const;
  const dirty = keys.some((k) => JSON.stringify(draft[k]) !== JSON.stringify(saved[k]));
  const appDefaults = app ? appChatDefaults(app, provider) : undefined;
  const modelValue = draft.model === undefined ? appDefaults?.model : draft.model;
  const currentModel = models.find((m) => m.value === modelValue) ?? (modelValue === null ? models.find((m) => m.is_default) : undefined);
  const label = PROVIDER_LABELS[provider];
  // ファストモードは、持つ AI（モデルのどれかが対応している）だけ出す（Codex は持たない）
  const hasFast = provider === "claude" || models.some((m) => m.supports_fast_mode);

  // アプリの設定の値（「アプリの設定に従う」の横に出す）
  const appModel = !appDefaults ? "…" : appDefaults.model === null ? providerDefaultModelLabel(provider, models) : modelDisplayName(models, appDefaults.model);
  const appEffort = appDefaults ? (appDefaults.effort ? EFFORT_LABELS[appDefaults.effort] : EFFORT_UNSET_LABEL) : "…";
  const appPermission = appDefaults ? PERMISSION_LABELS[appDefaults.permission_mode] : "…";

  const onSave = () => api.updateProject(project.id, { provider_chat_defaults: { ...project.provider_chat_defaults, [provider]: draft } });

  return (
    <div className="ai-defaults">
      <h3>{label} の既定</h3>
      <p className="muted small">
        このプロジェクトの {label} の新しいチャットは、ここで決めた設定から始まります。「アプリの設定に従う」の項目は、設定画面の AI の既定（{label}）を使います。
      </p>
      <div className="form">
        <Field label="モデル">
          <select
            value={draft.model === undefined ? INHERIT : (draft.model ?? PROVIDER_DEFAULT)}
            onChange={(e) => set("model", e.target.value === INHERIT ? INHERIT : e.target.value || null)}
          >
            <option value={INHERIT}>アプリの設定に従う（{appModel}）</option>
            {provider !== "claude" && <option value={PROVIDER_DEFAULT}>{providerDefaultModelLabel(provider, models)}</option>}
            <ModelOptions models={models} value={draft.model} />
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
        {hasFast && (
          <Field label="ファストモード">
            <select
              value={draft.fast_mode === undefined ? INHERIT : draft.fast_mode ? "on" : "off"}
              onChange={(e) => set("fast_mode", e.target.value === INHERIT ? INHERIT : e.target.value === "on")}
            >
              <option value={INHERIT}>アプリの設定に従う（{appDefaults ? (appDefaults.fast_mode ? "使う" : "使わない") : "…"}）</option>
              <option value="on" disabled={currentModel ? !currentModel.supports_fast_mode : false}>
                使う{currentModel?.supports_fast_mode === false ? "（このモデルは対応していません）" : currentModel?.supports_fast_mode === null ? "（このモデルの対応状況を確認できません）" : ""}
              </option>
              <option value="off">使わない</option>
            </select>
          </Field>
        )}
        <SaveActions save={save} disabled={!dirty} onSave={onSave} />
      </div>
    </div>
  );
}
