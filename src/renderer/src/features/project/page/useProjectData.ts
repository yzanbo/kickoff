import { useEffect, useMemo, useState } from "react";
import type { Project, Chat, ChatGroup } from "@shared/types";
import { useChats } from "@/stores/chats";
import { groupsStore, NO_GROUPS } from "@/stores/groups";
import { useProjects } from "@/stores/projects";
import { useKeyedStore } from "@/stores/useStore";

/** プロジェクト画面に出すもの（プロジェクト・チャット・グループ） */
export interface ProjectData {
  project: Project;
  chats: Chat[];
  groups: ChatGroup[];
}

/**
 * プロジェクト画面のデータ（プロジェクト・チャット・グループの店から読む。どれも知らせで直るので、取り直さない）。
 * まだ届いていないもの（初めて開くプロジェクトのグループなど）があれば、届くまで前に出していたプロジェクトの画面を返す
 * （画面の側で、data.project.id !== id の間は薄くして出す）。loading はどれかを読み込んでいる最中（タブの数の代わりに更新中の印を出す）
 */
export function useProjectData(id: number) {
  const { projectsById, loaded: projectsLoaded, error: projectsError } = useProjects();
  const project = projectsById.get(id);
  const chats = useChats({ projectId: id });
  const groups = useKeyedStore(groupsStore, id);
  const ready = project !== undefined && chats.loaded && groups.loaded;
  const current = useMemo(
    () => (ready ? { project, chats: chats.chats, groups: groups.data ?? NO_GROUPS } : undefined),
    [ready, project, chats.chats, groups.data],
  );
  // 前に出していたプロジェクトの画面（切り替えた直後、まだ届いていないものがある間に薄くして出す）
  const [last, setLast] = useState(current);
  useEffect(() => {
    if (current) setLast(current);
  }, [current]);
  // 一覧が届いたのに見つからないプロジェクト（消した・URL の番号が違う）は、前の画面を出さずに知らせる
  const missing = projectsLoaded && !project;
  return {
    data: missing ? undefined : (current ?? last),
    error: missing ? "プロジェクトが見つかりません" : (projectsError ?? chats.error ?? groups.error),
    loading: chats.loading || groups.loading,
  };
}
