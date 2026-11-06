import { useEffect, useState } from "react";
import { COMPACT_PROMPT_FIELDS, compactPromptFor, type CompactPromptKind } from "@shared/chat/prompts";
import { api } from "@/api";
import { useSave } from "@/hooks/useSave";
import { useProjects } from "@/stores/projects";
import { settingsStore, useAppSettings } from "@/stores/settings";
import { savedCompactPrompt } from "./compactPromptKinds";

/**
 * 圧縮前指示・圧縮後指示の書きかけと保存（projectId なしならアプリの設定の共通の指示、番号ならそのプロジェクトの指示）。
 * 設定の「定型文」の欄（CompactPromptForm）とチャット欄のメーターの詳細（CompactPromptEditor）で共通。
 * 保存した・ほかで変わったときは書きかけを保存した値に合わせる。空にすると null で保存する（送らない）。submit は save.run に渡す保存の中身。
 * オン / オフ（enabled）は文と別に、切り替えたらすぐ保存する（setEnabled。オフでも文は残し、送らないだけ）
 */
export function useCompactPrompt(kind: CompactPromptKind, projectId: number | null) {
  const settings = useAppSettings().data;
  const { projectsById } = useProjects();
  const { text: saved, enabled } = savedCompactPrompt(kind, settings, projectId === null ? undefined : projectsById.get(projectId), projectId);
  const [draft, setDraft] = useState(saved ?? "");
  const save = useSave();
  useEffect(() => setDraft(saved ?? ""), [saved]);
  const next = draft.trim() || null;
  const fields = COMPACT_PROMPT_FIELDS[kind];

  const update = async (patch: Record<string, string | boolean | null>) => {
    if (projectId !== null) return api.updateProject(projectId, patch);
    settingsStore.set(await api.updateSettings(patch));
  };
  const submit = () => update({ [fields.text]: next });
  const setEnabled = (value: boolean) => void save.run(() => update({ [fields.enabled]: value }));

  return { saved, enabled, setEnabled, draft, setDraft, dirty: next !== saved, save, submit };
}

/** そのプロジェクトのチャットに送る指示（オンの分を、設定の共通の指示 → プロジェクトの指示の順につないだもの。コアの送る文と同じ。なければ null） */
export function useSentCompactPrompt(kind: CompactPromptKind, projectId: number): string | null {
  const settings = useAppSettings().data;
  const { projectsById } = useProjects();
  return compactPromptFor(kind, settings, projectsById.get(projectId));
}
