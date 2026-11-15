import { useMemo } from "react";
import { matchesTags } from "@shared/project/tags";
import type { Project } from "@shared/types";
import { useSetting } from "@/hooks/useSetting";
import { SIDEBAR_PROJECT_ORDER } from "@/lib/storageKeys";
import { useChatsValue } from "@/stores/chats";
import { useProjects } from "@/stores/projects";
import { archivedProjects, recentOrder, sidebarOrder } from "./projectOrder";
import { useProjectTagFilter } from "./projectTagFilter";

/**
 * サイドバーと同じく見せるプロジェクト（サイドバー・全プロジェクトの画面・⌘⇧A・パネルのタブ・下のパネルで共通）:
 * active = しまっていない（アーカイブしていない）もの。サイドバーの並び（固定したものが先、そのあと見出しの「並び順」で手動の並び / 最近動いた順）。
 * visible = active のうち、見出しの「タグ」の絞り込みに合うもの（サイドバー・全プロジェクトのボードに出す並び）。
 * archived = しまったもの（名前順）のうち、タグの絞り込みに合うもの。
 * 最近動いた順のときだけチャットの一覧から並び（プロジェクトの ID の順）を読み、チャットが動いても並びが変わらなければ描き直さない
 */
export function useVisibleProjects() {
  const { projects } = useProjects();
  const tagFilter = useProjectTagFilter();
  const [order] = useSetting(SIDEBAR_PROJECT_ORDER);
  const recentIds = useChatsValue(
    (chats) =>
      recentOrder(projects, chats)
        .map((p) => p.id)
        .join(","),
    order === "recent",
  );
  const { selected, active: tagged } = tagFilter;
  // 絞り込みは tagFilter.matches と同じ決まり（matches は描くたびに作られるので、selected から引く）
  const lists = useMemo(() => {
    const byId = new Map(projects.map((p) => [p.id, p]));
    const active = recentIds === undefined ? sidebarOrder(projects) : recentIds.split(",").flatMap((id) => byId.get(Number(id)) ?? []);
    const matches = (project: Pick<Project, "tags">) => matchesTags(project.tags, selected);
    return {
      active,
      visible: tagged ? active.filter(matches) : active,
      archived: archivedProjects(projects).filter(matches),
    };
  }, [projects, recentIds, selected, tagged]);
  return { ...lists, tagFilter };
}
