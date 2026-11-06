import { useEffect, useState } from "react";
import { compactPromptFor } from "@shared/chat/prompts";
import { api } from "@/api";
import { useSave } from "@/hooks/useSave";
import { useProjects } from "@/stores/projects";
import { settingsStore, useAppSettings } from "@/stores/settings";
import { COMPACT_PROMPT_KINDS, savedCompactPrompt, type CompactPromptKind } from "./compactPromptKinds";

/**
 * 圧縮前指示・圧縮後指示の書きかけと保存（projectId なしならアプリの設定の共通の指示、番号ならそのプロジェクトの指示）。
 * 設定の「定型文」の欄（CompactPromptForm）とチャット欄のメーターの詳細（CompactPromptEditor）で共通。
 * 保存した・ほかで変わったときは書きかけを保存した値に合わせる。空にすると null で保存する（送らない）。submit は save.run に渡す保存の中身
 */
export function useCompactPrompt(kind: CompactPromptKind, projectId: number | null) {
  const settings = useAppSettings().data;
  const { projectsById } = useProjects();
  const saved = savedCompactPrompt(kind, settings, projectId === null ? undefined : projectsById.get(projectId), projectId);
  const [draft, setDraft] = useState(saved ?? "");
  const save = useSave();
  useEffect(() => setDraft(saved ?? ""), [saved]);
  const next = draft.trim() || null;

  const submit = async () => {
    const patch = { [COMPACT_PROMPT_KINDS[kind].field]: next };
    if (projectId !== null) return api.updateProject(projectId, patch);
    settingsStore.set(await api.updateSettings(patch));
  };

  return { saved, draft, setDraft, dirty: next !== saved, save, submit };
}

/** そのプロジェクトのチャットに送る指示（設定の共通の指示 → プロジェクトの指示の順につないだもの。コアの送る文と同じ。なければ null） */
export function useSentCompactPrompt(kind: CompactPromptKind, projectId: number): string | null {
  const settings = useAppSettings().data;
  const { projectsById } = useProjects();
  const field = COMPACT_PROMPT_KINDS[kind].field;
  return compactPromptFor(settings?.[field] ?? null, projectsById.get(projectId)?.[field] ?? null);
}
