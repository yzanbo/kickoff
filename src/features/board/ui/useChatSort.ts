import { useMemo } from "react";
import type { Chat } from "@shared/chat/types";
import { useChatStates } from "@/features/chat/ui/state/chatStates";
import { useBoard } from "./BoardContext";
import { groupNameIn, useGroupsOf } from "@/features/groups/ui/stores/groups";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { chatComparator, type ChatSort } from "./chatSort";

const NO_IDS: readonly number[] = Object.freeze([]);

/**
 * ボードの並び順（見え方の sort。ツールバーの「並び順」で変える）と、その比べ方 compare
 * （useChatBuckets の sort に渡す。列・まとまりの中がこの順になる）。projectIds はグループ名で並べるときにグループを読むプロジェクト
 */
export function useChatSort(projectIds: readonly number[]) {
  const { view, patch } = useBoard();
  const sort = view.sort;
  const { projectName } = useProjects();
  const { stateOf } = useChatStates();
  // グループは、グループ名で並べるときだけ読む
  const groupsOf = useGroupsOf(sort.key === "group" ? projectIds : NO_IDS);
  const { key, dir } = sort;
  const compare = useMemo(
    () => chatComparator({ key, dir }, { projectName, stateOf, groupName: (chat: Chat) => groupNameIn(groupsOf(chat.project_id), chat.group_id) }),
    [key, dir, projectName, stateOf, groupsOf],
  );
  const setSort = (next: ChatSort) => patch({ sort: next });
  return { sort, setSort, compare };
}
