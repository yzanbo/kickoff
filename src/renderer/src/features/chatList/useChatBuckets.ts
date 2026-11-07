import { useMemo } from "react";
import type { Chat } from "@shared/types";
import { useChatStates } from "@/app/chatStatesContext";
import { useGroupsOf } from "@/stores/groups";
import { useWorktreesOf } from "@/stores/worktrees";
import { bucketChats, type BucketContext, type BucketHead, type BucketOptions, type ChatBucket, type DraftTarget } from "./buckets";
import { bucketHueOf, bucketHuesOf } from "./bucketHues";
import type { ChatGrouping } from "./chatGrouping";

const NO_IDS: readonly number[] = Object.freeze([]);

/**
 * 分ける段に要るものだけを読む: グループで分けるならグループ（groupIds のプロジェクト）、作業場所で分けるならワークツリーの一覧
 * （worktreeIds のプロジェクト。省けば groupIds）。どちらもプロジェクトごとに 1 回。渡したプロジェクトの一覧が変わったときだけ新しい形を返す
 * （ほかのプロジェクトの一覧も、読んであれば引ける）
 */
export function useBucketContext(by: BucketOptions["by"], groupIds: readonly number[], worktreeIds: readonly number[] = groupIds): Omit<BucketContext, "projects"> {
  const levels: readonly string[] = typeof by === "string" ? [by] : by;
  const { pending } = useChatStates();
  const groupsOf = useGroupsOf(levels.includes("group") ? groupIds : NO_IDS);
  const worktreesOf = useWorktreesOf(levels.includes("worktree") ? worktreeIds : NO_IDS);
  return useMemo(() => ({ pending, groupsOf, worktreesOf }), [pending, groupsOf, worktreesOf]);
}

/**
 * bucketChats を画面の店で引く（回答待ちの依頼・グループ・ワークツリーは店から。グループ・作業場所で分けるときだけ、その一覧を読む）。
 * idle の間は一覧を読みに行かない（閉じているサイドバーのプロジェクト。読んであるものはそのまま使う）。
 * 渡したもの（チャット・下書き・並び・分け方）が変わったときだけ分け直す（ボードのように、描くたびに下書きを作って渡すところでは描くたびに分け直す。
 * 下書きは開いているパネルの操作を持つので、前の結果を使い回さない）
 */
export function useChatBuckets<D extends DraftTarget = DraftTarget>(
  chats: readonly Chat[],
  options: Omit<BucketOptions<D>, keyof BucketContext> & Pick<BucketContext, "projects"> & { idle?: boolean },
): ChatBucket<D>[] {
  const { by, project, projects, columns, pinned, archived, drafts, keepEmpty, idle = false } = options;
  // 読むのは、チャット・下書きのあるプロジェクトの分（グループは、チャットがなくても出すグループのために並びのプロジェクトの分も）
  const used = project !== undefined ? [project] : [...new Set([...chats.map((c) => c.project_id), ...(drafts ?? []).map((d) => d.projectId)])];
  const groupIds = project !== undefined ? used : [...new Set([...used, ...(projects ?? []).map((p) => p.id)])];
  const ctx = useBucketContext(by, idle ? NO_IDS : groupIds, idle ? NO_IDS : used);
  const levels = typeof by === "string" ? by : by.join(",");
  return useMemo(
    () => bucketChats(chats, { ...ctx, projects, by, project, columns, pinned, archived, drafts, keepEmpty }),
    // by は段の並び（levels）が変わったときだけ分け直す（配列を毎回作って渡しても、分け直さない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chats, ctx, projects, levels, project, columns, pinned, archived, drafts, keepEmpty],
  );
}

/**
 * まとまりの色を引く関数（サイドバーのまとまりの見出し・パネルのタブのまとまりで同じ色。bucketHues.ts）。まとめない・色を付けない（on が false）なら
 * いつも null。グループ・ワークツリーの一覧は、渡したプロジェクトの分を読む
 */
export function useBucketHueOf(grouping: ChatGrouping, projectIds: readonly number[], on: boolean): (head: Pick<BucketHead, "key" | "kind" | "group" | "hue">) => number | null {
  const by = on && grouping !== "none" ? grouping : null;
  const ctx = useBucketContext(by ?? [], by ? projectIds : NO_IDS);
  const ids = projectIds.join();
  return useMemo(() => {
    if (!by) return () => null;
    const hues = bucketHuesOf(by, projectIds, ctx);
    return (head: Pick<BucketHead, "key" | "kind" | "group" | "hue">) => bucketHueOf(head, hues);
    // projectIds は中身（ids）が変わったときだけ決め直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [by, ids, ctx]);
}
