import { Fragment, type ReactNode } from "react";
import type { Chat } from "@shared/types";
import { cx } from "@/lib/cx";
import type { ChatBucket } from "@/features/chatList/buckets";
import type { NewChatTarget } from "@/features/panel/usePanel";
import { ArchivedFold, splitArchived } from "@/ui/ArchivedFold";
import { UNGROUPED_SORT_ID } from "@/features/group/groups";
import { DraftCards } from "./DraftCards";
import type { PanelDraft } from "@/features/panel/state/panelDrafts";
import { GroupColumnHead } from "./GroupColumnHead";
import { orderGroupBuckets } from "./groupOrder";
import type { GroupBoardState } from "./useGroupBoard";

/**
 * グループのボードの、グループごとの列（ボード）・まとまり（リスト）。buckets は bucketChats のグループのまとまり（自分で作ったグループ → グループなし。
 * もうないグループのチャット・下書きはグループなしに入る）。「No Group」はグループの並びの board.ungroupedAt の位置
 * （覚えていなければ、ボードは先頭・リストはスイムレーンと同じくいちばん下。見出しのドラッグで並べ替える）。
 * afterGroups（グループを作成）は、いちばん後ろの自分で作ったグループのすぐ後ろ（グループがなければいちばん後ろ）に置く。
 * 列はドロップ先（チャットを移す・グループ・「No Group」を並べ替える）で、サイドバーから来たグループはハイライトする。
 * アーカイブ済みは、グループのいちばん下の閉じたまとまりに分ける（件数はアーカイブしていないものだけ。開閉はボードとリストで共通）
 */
export function GroupSections({
  projectId,
  buckets,
  board,
  onNewChat,
  render,
  foldPlace,
  highlight,
  list = false,
  afterGroups,
}: {
  projectId: number;
  buckets: readonly ChatBucket<PanelDraft>[];
  board: GroupBoardState;
  /** グループの列の＋（そのグループで新しいチャットを始める。開く先はボードのチャットの置き方で決まる） */
  onNewChat: (target: NewChatTarget) => void;
  /** カード（ボード）・行（リスト）の描き方 */
  render: (chat: Chat) => ReactNode;
  /** アーカイブ済みのまとまりの開閉を覚える場所（ボード） */
  foldPlace: string;
  /** 目立たせるグループ（サイドバーのグループ名から来たとき） */
  highlight?: number;
  list?: boolean;
  afterGroups?: ReactNode;
}) {
  const { over, reorder, dropProps } = board;
  const sections = orderGroupBuckets(buckets, board.ungroupedAt);
  // 「グループを作成」を置く位置（いちばん後ろの自分で作ったグループの後ろ。なければいちばん後ろ）
  const lastGroup = sections.findLastIndex((b) => b.kind === "group");
  const addAfter = lastGroup >= 0 ? lastGroup : sections.length - 1;
  return sections.map((bucket, i) => {
    const g = bucket.group ?? null;
    const key = g?.id ?? "none";
    const [members, archived] = splitArchived(bucket.chats);
    const body = (
      <>
        {/* その列（グループ）で入力中の新しいチャット */}
        <DraftCards drafts={bucket.drafts} />
        {members.length === 0 && <p className="column-empty">{g ? "チャットをここへドラッグ" : "なし"}</p>}
        {members.map(render)}
        <ArchivedFold place={foldPlace} foldKey={`${bucket.key}/archived`} count={archived.length} bodyClassName="archived-fold">
          {archived.map(render)}
        </ArchivedFold>
      </>
    );
    return (
      <Fragment key={key}>
        <section
          className={cx(
            list ? "list-group" : "board-column",
            over === key && "drop-target",
            reorder.classFor(g?.id ?? UNGROUPED_SORT_ID),
            g === null && "ungrouped",
            g !== null && g.id === highlight && "highlighted",
          )}
          data-group-id={g?.id}
          {...dropProps(g?.id ?? null)}
        >
          <GroupColumnHead group={g} count={members.length} board={board} onNewChat={() => onNewChat(g ? { projectId, group: g.id } : { projectId })} />
          {list ? body : <div className="column-cards">{body}</div>}
        </section>
        {i === addAfter && afterGroups}
      </Fragment>
    );
  });
}
