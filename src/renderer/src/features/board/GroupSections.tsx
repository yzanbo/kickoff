import type { ReactNode } from "react";
import type { Chat } from "@shared/types";
import { cx } from "@/lib/cx";
import type { ChatBucket } from "@/features/chatList/buckets";
import type { NewChatTarget } from "@/features/panel/usePanel";
import { ArchivedFold, splitArchived } from "@/ui/ArchivedFold";
import { UNGROUPED_SORT_ID } from "@/features/group/groups";
import { DraftCards } from "./DraftCards";
import type { PanelDraft } from "@/features/panel/state/panelDrafts";
import { GroupColumnHead } from "./GroupColumnHead";
import { bucketTone } from "@/features/chatList/StateChatsPopover";
import { ToneChip } from "@/ui/ToneChip";
import { orderGroupBuckets } from "@/features/group/groupOrder";
import type { GroupBoardState } from "./useGroupBoard";

/**
 * グループのボードの、グループごとの列（ボード）・まとまり（リスト）。buckets は bucketChats のグループのまとまり（自分で作ったグループ → グループなし。
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
  highlight,
  list = false,
  byState = false,
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
  /** グループの中を状態（作業中・回答待ち・未読・既読）の小見出しで区切る（列の分け方の「グループ×状態」。buckets は by: ["group", "status"] で分けたもの） */
  byState?: boolean;
}) {
  const { dropClass, reorder, dropProps } = board;
  return orderGroupBuckets(buckets, board.ungroupedAt).map((bucket) => {
    const g = bucket.group ?? null;
    const key = g?.id ?? "none";
    const [members, archived] = splitArchived(bucket.chats);
    const body = (
      <>
        {/* その列（グループ）で入力中の新しいチャット */}
        <DraftCards drafts={bucket.drafts} />
        {members.length === 0 && <p className="column-empty">{g ? "チャットをここへドラッグ" : "なし"}</p>}
        {byState && bucket.children ? <StateParts parts={bucket.children} render={render} /> : members.map(render)}
        <ArchivedFold place={foldPlace} foldKey={`${bucket.key}/archived`} count={archived.length} bodyClassName="archived-fold">
          {archived.map(render)}
        </ArchivedFold>
      </>
    );
    return (
      <section
        key={key}
        className={cx(
          list ? "list-group" : "board-column",
          dropClass(g?.id ?? null),
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
    );
  });
}

/**
 * グループの中の状態ごとの小分け（小見出しの札 ＋ カード・行。チャットのない状態は出さない。アーカイブ済みはグループのいちばん下の閉じたまとまりのまま）
 */
function StateParts({ parts, render }: { parts: readonly ChatBucket<PanelDraft>[]; render: (chat: Chat) => ReactNode }) {
  return parts.map((part) => {
    const [active] = splitArchived(part.chats);
    if (active.length === 0) return null;
    return (
      <div key={part.key} className="group-state-part">
        <div className="group-state-head">
          <ToneChip tone={bucketTone(part)} dot label={part.label} count={active.length} />
        </div>
        {active.map(render)}
      </div>
    );
  });
}
