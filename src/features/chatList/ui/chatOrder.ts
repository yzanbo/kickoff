import { useCallback, useMemo } from "react";
import type { Chat } from "@shared/chat/types";
import { api } from "@/foundation/ui/api";
import { addChats } from "@/features/chat/ui/store/knownChats";
import { flattenBucketChats, type BucketBy, type BucketOptions } from "./buckets";
import type { ChatGrouping } from "./chatGrouping";
import { bucketScopes, byManual, insertNear, moveChatInOrder } from "./manualOrder";
import { useChatBuckets } from "./useChatBuckets";
import { useVisibleProjects } from "@/features/projects/ui/useVisibleProjects";
import { useChatLayout, type ChatOrder } from "./chatLayout";

/**
 * サイドバー・パネルのタブ（一覧のペイン）で同じ分け方: 段はまとめ方（グループ・作業場所）の中を、状態順なら状態ごとに分ける
 * （まとめない × 最近動いた順・手動は分けない）。まとまりの中は手動ならドラッグで並べた順（byManual。ほかは最後に動いた順 = bucketChats の既定）。
 * まとめないときは固定・アーカイブ済みを 1 つのまとまりに、まとめるときはまとまりごとの先頭・いちばん下に入れる
 */
export function chatListOptions(grouping: ChatGrouping, order: ChatOrder): { by: BucketBy[] } & Pick<BucketOptions, "pinned" | "archived" | "sort"> {
  return {
    by: [...(grouping === "none" ? [] : [grouping]), ...(order === "status" ? (["status"] as const) : [])],
    pinned: grouping === "none" ? true : "nested",
    archived: grouping === "none" ? "bucket" : "nested",
    sort: order === "manual" ? byManual : undefined,
  };
}

/** サイドバーのチャットの並び（useChatOrder） */
export interface ChatListOrder {
  /** 画面に並ぶ順のチャットの ID */
  ids: readonly number[];
  /** チャットの ID → 何番目か */
  index: ReadonlyMap<number, number>;
  /** チャットの ID → 並べ替えられる範囲（いちばん外のまとまり。bucketScopes） */
  scope: ReadonlyMap<number, string>;
}

/**
 * サイドバーのチャットの並び。サイドバーと同じまとめ方・並び順・固定・アーカイブ済みで分けて 1 列にする
 * （useWorkspaceRows と同じ分け方。絞り込みは入れない）。project がなければ全プロジェクトで、サイドバーのプロジェクトの並びで分ける。
 * パネルのチャットのタブをサイドバーと同じ順に並べ、ドラッグで並べ替えた順を保存するのに使う
 */
export function useChatOrder(chats: readonly Chat[], project: number | undefined, enabled: boolean): ChatListOrder {
  const { grouping, order } = useChatLayout();
  const { visible } = useVisibleProjects();
  const options = chatListOptions(grouping, order);
  const buckets = useChatBuckets(chats, {
    ...options,
    by: project === undefined ? ["project", ...options.by] : options.by,
    project,
    projects: project === undefined ? visible : undefined,
    idle: !enabled,
  });
  return useMemo(() => {
    const ids = flattenBucketChats(buckets).map((c) => c.id);
    // 全プロジェクトで分けたときは、プロジェクトの中のまとまりを範囲にする（中の段がなければプロジェクト）
    const scope = bucketScopes(project === undefined ? buckets.flatMap((b) => b.children ?? [b]) : buckets);
    return { ids, index: new Map(ids.map((id, i) => [id, i])), scope };
  }, [buckets, project]);
}

/**
 * ドラッグでチャットを並べ替える（サイドバーの行・パネルの一覧のペインのチャットのタブ）。並べられるのは、同じ範囲
 * （同じグループ・作業場所・固定・アーカイブ済みの中。order.scope）のチャットどうしだけ。落とすと、いま見えているサイドバーの並びのまま
 * 動かしたものだけを動かし、その並び全体を手動の並びとして保存して（api.reorderChats。プロジェクトの中の 1 つの並び）、並び順を手動に切り替える
 * （最近順・状態順のときも。プロジェクトの並べ替えと同じ）。応答のチャットはすぐ一覧に入れ、知らせを待たずにそろえる
 */
export function useManualChatReorder(order: ChatListOrder) {
  const { order: current, setOrder } = useChatLayout();
  /** moved を target の側へ動かせるか（同じ範囲のチャットどうしか） */
  const canMove = useCallback(
    (moved: number, target: number) => moved !== target && order.scope.has(moved) && order.scope.get(moved) === order.scope.get(target),
    [order],
  );
  const move = useCallback(
    (projectId: number, moved: number, target: number, side: "before" | "after") => {
      if (!canMove(moved, target)) return;
      const next = moveChatInOrder(order.ids, moved, target, side);
      if (!next) return;
      if (current !== "manual") setOrder("manual");
      void api.reorderChats(projectId, next).then(addChats);
    },
    [canMove, order, current, setOrder],
  );
  /** 一覧になかったチャット（親から外したばかりの子チャット）を target の前後へ入れて保存する（並び順は手動に切り替える） */
  const insert = useCallback(
    (projectId: number, moved: number, target: number, side: "before" | "after") => {
      const next = insertNear(order.ids, moved, target, side);
      if (!next) return;
      if (current !== "manual") setOrder("manual");
      void api.reorderChats(projectId, next).then(addChats);
    },
    [order, current, setOrder],
  );
  return { canMove, move, insert };
}
