import { useEffect, useMemo, useState } from "react";
import type { Project } from "@shared/projects/types";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { useProjectChatsLoad, useProjectGroupsLoad } from "@/features/projects/ui/projectChats";

/** プロジェクト画面に出すもの（中のチャット・グループは、画面の中身がそれぞれの店から読む） */
export interface ProjectData {
  project: Project;
}

/**
 * プロジェクト画面のデータ（プロジェクトの店と、チャット・グループの一覧を読み終えたか。どれも知らせで直るので、取り直さない）。
 * まだ届いていないもの（初めて開くプロジェクトのグループなど）があれば、届くまで前に出していたプロジェクトの画面を返す
 * （画面の側で、data.project.id !== id の間は薄くして出す）。loading はどれかを読み込んでいる最中（タブの数の代わりに更新中の印を出す）
 */
export function useProjectData(id: number) {
  const { projectsById, error: projectsError } = useProjects();
  const project = projectsById.get(id);
  const chats = useProjectChatsLoad(id);
  const groups = useProjectGroupsLoad(id);
  const ready = project !== undefined && chats.loaded && groups.loaded;
  const current = useMemo(() => (ready ? { project } : undefined), [ready, project]);
  // 前に出していたプロジェクトの画面（切り替えた直後、まだ届いていないものがある間に薄くして出す）
  const [last, setLast] = useState(current);
  useEffect(() => {
    if (current) setLast(current);
  }, [current]);
  return {
    data: current ?? last,
    error: projectsError ?? chats.error ?? groups.error,
    loading: chats.loading || groups.loading,
  };
}
