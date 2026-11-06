import { useEffect, useState } from "react";
import { api } from "@/api";
import { useSave } from "@/hooks/useSave";
import { useProjects } from "@/stores/projects";
import { settingsStore, useAppSettings } from "@/stores/settings";

/**
 * 圧縮前指示の書きかけと保存（projectId なしならアプリの設定の共通の指示、番号ならそのプロジェクトの指示）。
 * 設定の「定型文」の欄（PreCompactPromptForm）とチャット欄のメーターの詳細（PreCompactPromptEditor）で共通。
 * 保存した・ほかで変わったときは書きかけを保存した値に合わせる。空にすると null で保存する（送らない）。submit は save.run に渡す保存の中身
 */
export function usePreCompactPrompt(projectId: number | null) {
  const settings = useAppSettings().data;
  const { projectsById } = useProjects();
  const saved = (projectId === null ? settings?.pre_compact_prompt : projectsById.get(projectId)?.pre_compact_prompt) ?? null;
  const [draft, setDraft] = useState(saved ?? "");
  const save = useSave();
  useEffect(() => setDraft(saved ?? ""), [saved]);
  const next = draft.trim() || null;

  const submit = async () => {
    if (projectId !== null) return api.updateProject(projectId, { pre_compact_prompt: next });
    settingsStore.set(await api.updateSettings({ pre_compact_prompt: next }));
  };

  return { saved, draft, setDraft, dirty: next !== saved, save, submit };
}
