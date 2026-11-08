import type { ChatBucket } from "@/features/chatList/buckets";
import type { PanelDraft } from "@/features/panel/state/panelDrafts";
import type { BoardView } from "./BoardHeader";
import { BoardLanes } from "./BoardLanes";
import type { ChatSort, ChatSortKey } from "./chatSort";
import { ChatTable } from "./ChatTable";
import { FlatTasks } from "./FlatTasks";
import { LaneGroupCreate } from "./GroupCreateForm";
import { ProjectGroupColumns } from "./ProjectGroupColumns";
import { ListSections, StateColumns } from "./StateColumn";
import type { useBoardCards } from "./useBoardCards";
import type { useProjectLaneReorder } from "./useProjectLaneReorder";

interface Props {
  view: BoardView;
  /** 段（スイムレーン）に分けるか */
  split: boolean;
  /** 状態で分けない（全プロジェクトのボードの「分けない」） */
  flat: boolean;
  /** プロジェクトの段の中をグループの列にする（全プロジェクトのボードの「グループ」） */
  byGroup: boolean;
  /** グループの列の中を状態で小分けにする（列の分け方の「グループ×状態」。buckets はグループの下を状態でも分けたもの） */
  byState: boolean;
  buckets: ChatBucket<PanelDraft>[];
  drafts: readonly PanelDraft[];
  allProjects: boolean;
  /** 作業場所の段にプロジェクト名を添える（いくつかのプロジェクトが並ぶ全プロジェクトのボード） */
  showLaneProject: boolean;
  foldPlace: string;
  cards: ReturnType<typeof useBoardCards>;
  laneReorder: ReturnType<typeof useProjectLaneReorder>;
  /** 表の列と並び順 */
  table: { columns: readonly ChatSortKey[]; sort: ChatSort; onSort: (sort: ChatSort) => void };
}

/**
 * カンバン（プロジェクト・全プロジェクトで共通）の中身。表示（ボード / リスト / 表）× 段に分けるか × 列の分け方（状態・グループ・分けない）で描き分ける。
 * 表では、段は表を分け、列の分け方は表の中のまとまりの見出しの行になる
 */
export function KanbanBody({ view, split, flat, byGroup, byState, buckets, drafts, allProjects, showLaneProject, foldPlace, cards, laneReorder, table }: Props) {
  const list = view !== "board";
  const render = view === "list" ? cards.row : cards.card;
  const tableRow = (chat: Parameters<typeof cards.row>[0]) => cards.tableRow(chat, table.columns);
  const tableOf = (sections: readonly ChatBucket<PanelDraft>[], laneDrafts: readonly PanelDraft[], archivedKey: string, headless = false, nested = false) => (
    <div className="board-table">
      <ChatTable
        sections={sections}
        headless={headless}
        nested={nested}
        drafts={laneDrafts}
        showDraftProject={allProjects}
        columns={table.columns}
        sort={table.sort}
        onSort={table.onSort}
        row={tableRow}
        foldPlace={foldPlace}
        archivedKey={archivedKey}
      />
    </div>
  );

  if (byGroup) {
    // グループの列: プロジェクトの段ごとに、そのプロジェクトのグループの列（カードをドラッグしてグループを移す）。表なら、段ごとの表の中をグループのまとまりに
    // 「グループを作成」は段の見出しのプロジェクト名の右に置く（どの表示でも）
    return (
      <BoardLanes
        lanes={buckets}
        list={list}
        foldPlace={foldPlace}
        {...laneReorder}
        actions={(lane) => lane.projectId !== undefined && <LaneGroupCreate projectId={lane.projectId} />}
      >
        {(lane) =>
          lane.projectId === undefined ? null : view === "table" ? (
            tableOf(lane.children ?? [], lane.drafts, `${lane.key}/archived`, false, byState)
          ) : (
            <ProjectGroupColumns projectId={lane.projectId} chats={lane.chats} drafts={lane.drafts} list={list} foldPlace={foldPlace} render={render} />
          )
        }
      </BoardLanes>
    );
  }
  if (split) {
    // 段に分ける: 段ごとに、ボードと同じく下書き（その段に入る作成先のもの）→ 状態の列を並べる（リストなら 下書き → 状態のまとまり → アーカイブ済み を縦に）
    return (
      <BoardLanes lanes={buckets} list={list} foldPlace={foldPlace} showProject={showLaneProject} {...laneReorder}>
        {(lane) =>
          view === "table" ? (
            flat ? tableOf([lane], lane.drafts, `${lane.key}/archived`, true) : tableOf(lane.children ?? [], lane.drafts, `${lane.key}/archived`)
          ) : flat ? (
            <FlatTasks
              chats={lane.chats}
              drafts={lane.drafts}
              list={list}
              showDraftProject={allProjects}
              foldPlace={foldPlace}
              archivedKey={`${lane.key}/archived`}
              render={render}
            />
          ) : view === "board" ? (
            <StateColumns columns={lane.children ?? []} drafts={lane.drafts} showDraftProject={allProjects} foldPlace={foldPlace} render={cards.card} />
          ) : (
            <ListSections
              columns={lane.children ?? []}
              drafts={lane.drafts}
              showDraftProject={allProjects}
              foldPlace={foldPlace}
              archivedKey={`${lane.key}/archived`}
              render={cards.row}
            />
          )
        }
      </BoardLanes>
    );
  }
  if (view === "table") return flat ? tableOf(buckets.slice(0, 1), drafts, "flat/archived", true) : tableOf(buckets, drafts, "archived");
  if (flat) {
    // 状態で分けない: 下書き → チャット（並び順）を 1 つの並びに（ボードはカードを幅に合わせて折り返し、リストは 1 列）
    return (
      <div className={list ? "board-list" : "board-flat"}>
        <FlatTasks
          chats={buckets[0]?.chats ?? []}
          drafts={drafts}
          list={list}
          showDraftProject={allProjects}
          foldPlace={foldPlace}
          archivedKey="flat/archived"
          render={render}
        />
      </div>
    );
  }
  return view === "board" ? (
    <div className="board-columns">
      <StateColumns columns={buckets} drafts={drafts} showDraftProject={allProjects} foldPlace={foldPlace} render={cards.card} />
    </div>
  ) : (
    <div className="board-list">
      <ListSections columns={buckets} drafts={drafts} showDraftProject={allProjects} foldPlace={foldPlace} archivedKey="archived" render={cards.row} />
    </div>
  );
}
