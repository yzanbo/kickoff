import { Fragment, type ReactNode } from "react";
import type { Chat } from "@shared/types";
import { cx } from "@/lib/cx";
import type { ChatBucket } from "@/features/chatList/buckets";
import type { PanelController } from "@/features/panel/usePanel";
import { ArchivedFold, splitArchived } from "./ArchivedFold";
import { DraftCards, type BoardDraft } from "./DraftCards";
import { GroupColumnHead } from "./GroupColumnHead";
import type { GroupBoardState } from "./useGroupBoard";

/**
 * グループのボードの、グループごとの列（ボード）・まとまり（リスト）。buckets は bucketChats のグループのまとまり（自分で作ったグループ → グループなし。
 * もうないグループのチャット・下書きはグループなしに入る）。ボードは「グループなし」が先頭、
 * リストはスイムレーンと同じく、自分で作ったグループのあとのいちばん下（beforeUngrouped はその直前に置くもの。グループを作成）。
 * 列はドロップ先（チャットを移す・グループを並べ替える）で、サイドバーから来たグループはハイライトする。
 * アーカイブ済みは、グループのいちばん下の閉じたまとまりに分ける（件数はアーカイブしていないものだけ。開閉はボードとリストで共通）
 */
export function GroupSections({
  projectId,
  buckets,
  board,
  panel,
  render,
  foldPlace,
  highlight,
  list = false,
  beforeUngrouped,
}: {
  projectId: number;
  buckets: readonly ChatBucket<BoardDraft>[];
  board: GroupBoardState;
  panel: PanelController;
  /** カード（ボード）・行（リスト）の描き方 */
  render: (chat: Chat) => ReactNode;
  /** アーカイブ済みのまとまりの開閉を覚える場所（ボード） */
  foldPlace: string;
  /** 目立たせるグループ（サイドバーのグループ名から来たとき） */
  highlight?: number;
  list?: boolean;
  beforeUngrouped?: ReactNode;
}) {
  const { over, reorder, dropProps } = board;
  const ungrouped = buckets.filter((b) => b.kind === "ungrouped");
  const groups = buckets.filter((b) => b.kind === "group");
  const sections = list ? [...groups, ...ungrouped] : [...ungrouped, ...groups];
  return sections.map((bucket) => {
    const g = bucket.group ?? null;
    const key = g?.id ?? "none";
    const [members, archived] = splitArchived(bucket.chats);
    const body = (
      <>
        {/* その列（グループ）で入力中の新しいチャット */}
        <DraftCards drafts={bucket.drafts} />
        {members.length === 0 && <p className="column-empty">{g ? "チャットをここへドラッグ" : "なし"}</p>}
        {members.map(render)}
        <ArchivedFold place={foldPlace} foldKey={`${bucket.key}/archived`} count={archived.length}>
          {archived.map(render)}
        </ArchivedFold>
      </>
    );
    return (
      <Fragment key={key}>
        {g === null && beforeUngrouped}
        <section
          className={cx(list ? "list-group" : "board-column", over === key && "drop-target", g ? reorder.classFor(g.id) : "ungrouped", g !== null && g.id === highlight && "highlighted")}
          data-group-id={g?.id}
          {...dropProps(g?.id ?? null)}
        >
          <GroupColumnHead group={g} count={members.length} board={board} onNewChat={() => panel.openNew(g ? { projectId, group: g.id } : { projectId })} />
          {list ? body : <div className="column-cards">{body}</div>}
        </section>
      </Fragment>
    );
  });
}
