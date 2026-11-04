import { useMemo } from "react";
import type { Chat } from "@shared/types";
import { useChatStates } from "@/app/chatStatesContext";
import { useGroupsOf } from "@/stores/groups";
import { useWorktreesOf } from "@/stores/worktrees";
import { bucketChats, type BucketContext, type BucketOptions, type ChatBucket, type DraftTarget } from "./buckets";

const NO_IDS: readonly number[] = Object.freeze([]);

/**
 * 分ける段に要るものだけを読む: グループで分けるならグループ、作業場所で分けるならワークツリーの一覧（どちらもプロジェクトごとに 1 回。
 * projectIds にないプロジェクトの一覧も、読んであれば引ける）
 */
export function useBucketContext(by: BucketOptions["by"], projectIds: readonly number[]): Omit<BucketContext, "projects"> {
  const levels: readonly string[] = typeof by === "string" ? [by] : by;
  const { pending } = useChatStates();
  const groupsOf = useGroupsOf(levels.includes("group") ? projectIds : NO_IDS);
  const worktreesOf = useWorktreesOf(levels.includes("worktree") ? projectIds : NO_IDS);
  return useMemo(() => ({ pending, groupsOf, worktreesOf }), [pending, groupsOf, worktreesOf]);
}

/**
 * bucketChats を画面の店で引く（回答待ちの依頼・グループ・ワークツリーは店から。グループ・作業場所で分けるときだけ、その一覧を読む）。
 * idle の間は一覧を読みに行かない（閉じているサイドバーのプロジェクト。読んであるものはそのまま使う）。
 * チャット・下書き・並び・分け方が変わったときだけ分け直す
 */
export function useChatBuckets<D extends DraftTarget = DraftTarget>(
  chats: readonly Chat[],
  options: Omit<BucketOptions<D>, keyof BucketContext> & Pick<BucketContext, "projects"> & { idle?: boolean },
): ChatBucket<D>[] {
  const { by, project, projects, columns, pinned, archived, drafts, keepEmpty, idle = false } = options;
  const projectIds =
    project !== undefined ? [project] : [...new Set([...chats.map((c) => c.project_id), ...(drafts ?? []).map((d) => d.projectId), ...(projects ?? []).map((p) => p.id)])];
  const ctx = useBucketContext(by, idle ? NO_IDS : projectIds);
  const levels = typeof by === "string" ? by : by.join(",");
  return useMemo(
    () => bucketChats(chats, { ...ctx, projects, by, project, columns, pinned, archived, drafts, keepEmpty }),
    // by は段の並び（levels）が変わったときだけ分け直す（配列を毎回作って渡しても、分け直さない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chats, ctx, projects, levels, project, columns, pinned, archived, drafts, keepEmpty],
  );
}
