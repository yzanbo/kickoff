import { useMemo } from "react";
import type { Chat } from "@shared/types";
import { useChatStates } from "@/app/chatStatesContext";
import { useSetting } from "@/hooks/useSetting";
import { BOARD_SORT } from "@/lib/storageKeys";
import { groupNameIn, useGroupsOf } from "@/stores/groups";
import { useProjects } from "@/stores/projects";
import { chatComparator, DEFAULT_CHAT_SORT, parseChatSort, sameChatSort, type ChatSort } from "./chatSort";

const NO_IDS: readonly number[] = Object.freeze([]);

/**
 * ボードの並び順（すべてのボードで共通に覚える。表の見出し・ツールバーの「並び順」で変える）と、その比べ方 compare
 * （useChatBuckets の sort に渡す。列・まとまりの中がこの順になる）。projectIds はグループ名で並べるときにグループを読むプロジェクト
 */
export function useChatSort(projectIds: readonly number[]) {
  const [stored, setStored] = useSetting(BOARD_SORT);
  const sort: ChatSort = parseChatSort(stored) ?? DEFAULT_CHAT_SORT;
  const { projectName } = useProjects();
  const { stateOf } = useChatStates();
  // グループは、グループ名で並べるときだけ読む
  const groupsOf = useGroupsOf(sort.key === "group" ? projectIds : NO_IDS);
  const { key, dir } = sort;
  const compare = useMemo(
    () => chatComparator({ key, dir }, { projectName, stateOf, groupName: (chat: Chat) => groupNameIn(groupsOf(chat.project_id), chat.group_id) }),
    [key, dir, projectName, stateOf, groupsOf],
  );
  // 初めの並びに戻したら、覚えた値を消す
  const setSort = (next: ChatSort) => setStored(sameChatSort(next, DEFAULT_CHAT_SORT) ? null : next);
  return { sort, setSort, compare };
}
