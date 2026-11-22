import type { ReactNode } from "react";
import type { Chat } from "@shared/chat/types";
import { cx } from "@/foundation/ui/lib/cx";
import type { ChatBucket } from "@/features/chatList/ui/buckets";
import type { NewChatPlace } from "@/features/chat/ui";
import { activeOf, ArchivableItems, ColumnBody } from "@/features/chatList/ui";
import { orderGroupBuckets, UNGROUPED_SORT_ID } from "@/features/groups/ui";
import { DraftCards } from "./DraftCards";
import type { PlacedDraft } from "@/features/chatPanel/ui/drafts/panelDrafts";
import { GroupColumnHead } from "./GroupColumnHead";
import { bucketTone } from "@/features/chatList/ui/StateChatsPopover";
import { BucketChip } from "@/features/chatList/ui/StateChip";
import type { GroupBoardState } from "./useGroupBoard";
import { RowBudgetScope, useRowBudgets } from "@/foundation/ui/hooks/useProgressiveRows";
import { ProgressiveItems } from "@/foundation/ui/kit/ProgressiveRows";

/**
 * 全プロジェクトのボードの「列: グループ」の、グループごとの列（ボード）・まとまり（リスト）。buckets は bucketChats のグループのまとまり（自分で作ったグループ → グループなし。
 * もうないグループのチャット・下書きはグループなしに入る）。「No Group」はグループの並びの board.ungroupedAt の位置
 * （覚えていなければ、ボードは先頭・リストはスイムレーンと同じくいちばん下。見出しのドラッグで並べ替える）。
 * 列はドロップ先（チャットを移す・グループ・「No Group」を並べ替える）で、サイドバーから来たグループはハイライトする。
 * アーカイブ済みは、グループのいちばん下の閉じたまとまりに分ける（件数はアーカイブしていないものだけ。開閉はボードとリストで共通）。
 * byState なら、グループの中を状態の小見出しで区切る（列の分け方の「グループ×状態」）
 */
export function GroupSections({
  projectId,
  buckets,
  board,
  onNewChat,
  render,
  foldPlace,
  list = false,
  byState = false,
}: {
  projectId: number;
  buckets: readonly ChatBucket<PlacedDraft>[];
  board: GroupBoardState;
  /** グループの列の＋（そのグループで新しいチャットを始める。開く先はボードのチャットの置き方で決まる） */
  onNewChat: (target: NewChatPlace) => void;
  /** カード（ボード）・行（リスト）の描き方 */
  render: (chat: Chat) => ReactNode;
  /** アーカイブ済みのまとまりの開閉を覚える場所（ボード） */
  foldPlace: string;
  list?: boolean;
  /** グループの中を状態（作業中・回答待ち・未読・既読）の小見出しで区切る（列の分け方の「グループ×状態」。buckets は by: ["group", "status"] で分けたもの） */
  byState?: boolean;
}) {
  const { dropClass, reorder, dropProps } = board;
  const ordered = orderGroupBuckets(buckets, board.ungroupedAt);
  // 最初に描く行の上限（hooks/useProgressiveRows.ts）: 横に並ぶ列（ボード）はどれにも同じだけ、縦に並ぶまとまり（リスト）は上から順に
  const budgets = useRowBudgets(
    ordered.map((b) => activeOf(b.chats).length),
    list,
    boardWidth,
  );
  return ordered.map((bucket, i) => {
    const g = bucket.group ?? null;
    const key = g?.id ?? "none";
    const members = activeOf(bucket.chats);
    return (
      <RowBudgetScope key={key} value={budgets[i]}>
      <section
        className={cx(
          list ? "list-group" : "board-column",
          dropClass(g?.id ?? null),
          g === null && "ungrouped",
        )}
        data-group-id={g?.id}
        {...reorder.attrsFor(g?.id ?? UNGROUPED_SORT_ID, list ? "y" : "x")}
        {...dropProps(g?.id ?? null)}
      >
        {/* 数は送る前の新しいチャット（下書き。New Chat）も 1 つと数える（サイドバーのグループの見出しと同じ） */}
        <GroupColumnHead group={g} count={members.length + bucket.drafts.length} board={board} onNewChat={() => onNewChat(g ? { projectId, group: g.id } : { projectId })} />
        <ColumnBody list={list}>
          <ArchivableItems
            items={bucket.chats}
            render={render}
            // その列（グループ）で入力中の新しいチャット
            lead={<DraftCards drafts={bucket.drafts} />}
            empty={<p className="empty-note column-empty">{g ? "チャットをここへドラッグ" : "なし"}</p>}
            inner={byState && bucket.children ? <StateParts parts={bucket.children} render={render} /> : undefined}
            foldPlace={foldPlace}
            foldKey={`${bucket.key}/archived`}
          />
        </ColumnBody>
      </section>
      </RowBudgetScope>
    );
  });
}

/**
 * グループの中の状態ごとの小分け（小見出しの札 ＋ カード・行。チャットのない状態は出さない。アーカイブ済みはグループのいちばん下の閉じたまとまりのまま）
 */
function StateParts({ parts, render }: { parts: readonly ChatBucket<PlacedDraft>[]; render: (chat: Chat) => ReactNode }) {
  // 最初に描く行の上限を、縦に並ぶ小分けの上から順に配る
  const budgets = useRowBudgets(parts.map((part) => activeOf(part.chats).length));
  return parts.map((part, i) => {
    const active = activeOf(part.chats);
    if (active.length === 0) return null;
    return (
      <RowBudgetScope key={part.key} value={budgets[i]}>
      <div className="group-state-part">
        <div className="group-state-head">
          <BucketChip bucket={part} tone={bucketTone(part)} count={active.length} chats={active} />
        </div>
        <ProgressiveItems items={active} render={render} />
      </div>
      </RowBudgetScope>
    );
  });
}

/**
 * 横に並ぶ列に使える幅の見込み（描く前なので列の入れ物はまだない。窓の幅から、先に描いてある左のサイドバー・縦の列の右端までを引く）。
 * 最初の描画で行の上限を配るときだけ読む
 */
function boardWidth(): number {
  const left = document.querySelector(".sidebar")?.getBoundingClientRect().right ?? 0;
  return window.innerWidth - left;
}
