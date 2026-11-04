import { Fragment, type ReactNode } from "react";
import type { Chat, ChatGroup } from "@shared/types";
import { useChatStates } from "@/app/chatStatesContext";
import { cx } from "@/lib/cx";
import { DraftCards } from "./DraftCards";
import type { PanelController } from "@/features/panel/usePanel";
import { ArchivedFold, splitArchived } from "./ArchivedFold";
import { GroupColumnHead } from "./GroupColumnHead";
import type { useBoardCards } from "./useBoardCards";
import type { GroupBoardState } from "./useGroupBoard";

/**
 * グループのボードの、グループごとの列（ボード）・まとまり（リスト）。ボードは「グループなし」が先頭、
 * リストはスイムレーンと同じく、自分で作ったグループのあとのいちばん下（beforeUngrouped はその直前に置くもの。グループを作成）。
 * 列はドロップ先（チャットを移す・グループを並べ替える）で、サイドバーから来たグループはハイライトする。
 * アーカイブ済みは、グループのいちばん下の閉じたまとまりに分ける（件数はアーカイブしていないものだけ）
 */
export function GroupSections({
  projectId,
  groups,
  board,
  panel,
  cards,
  highlight,
  list = false,
  beforeUngrouped,
}: {
  projectId: number;
  groups: ChatGroup[];
  board: GroupBoardState;
  panel: PanelController;
  cards: ReturnType<typeof useBoardCards>;
  /** 目立たせるグループ（サイドバーのグループ名から来たとき） */
  highlight?: number;
  list?: boolean;
  beforeUngrouped?: ReactNode;
}) {
  const { stateOf } = useChatStates();
  const { over, reorder, dropProps } = board;
  const sections: (ChatGroup | null)[] = list ? [...groups, null] : [null, ...groups];
  const render = list ? cards.row : cards.card;
  return sections.map((g) => {
    const key = g?.id ?? "none";
    const [members, archived] = splitArchived(board.membersOf(g?.id ?? null), (r) => r);
    const item = (chat: Chat) => render({ chat, state: stateOf(chat) });
    const body = (
      <>
        {/* その列（グループ）で入力中の新しいチャット */}
        <DraftCards panel={panel} filter={(t) => t.projectId === projectId && (t.group ?? null) === (g?.id ?? null)} />
        {members.length === 0 && <p className="column-empty">{g ? "チャットをここへドラッグ" : "なし"}</p>}
        {members.map(item)}
        <ArchivedFold foldKey={`groups:${projectId}:${list ? "list" : "board"}:${key}`} count={archived.length}>
          {archived.map(item)}
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
