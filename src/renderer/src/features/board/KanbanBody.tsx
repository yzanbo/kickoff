import type { ChatBucket } from "@/features/chatList/buckets";
import type { PanelDraft } from "@/features/panel/state/panelDrafts";
import type { BoardView } from "./BoardHeader";
import { BoardLanes } from "./BoardLanes";
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
  /** 状態で分けない（列の分け方の「状態」「グループ」がどちらもオフ） */
  flat: boolean;
  /** グループの列にする（全プロジェクトのボードはプロジェクトの段の中、プロジェクトのボードはそのまま・段ごとに） */
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
  /** 段をグループの落とし先にする（プロジェクトのボードの段: グループ。useGroupLaneDrop の laneProps） */
  laneDrop?: (lane: ChatBucket<PanelDraft>) => Record<string, unknown>;
  /** プロジェクトのボードのプロジェクト（グループの列に使う。全プロジェクトのボードにはない） */
  projectId?: number;
}

/**
 * カンバン（プロジェクト・全プロジェクトで共通）の中身。表示（ボード / リスト）× 段に分けるか × 列の分け方（状態・グループ・分けない）で描き分ける
 */
export function KanbanBody({ view, split, flat, byGroup, byState, buckets, drafts, allProjects, showLaneProject, foldPlace, cards, laneReorder, laneDrop, projectId }: Props) {
  const list = view === "list";
  const render = list ? cards.row : cards.card;

  if (byGroup && projectId !== undefined) {
    // プロジェクトのボードのグループの列: グループを列にして縦に並べ、カードのドラッグでグループを移す（利用者の依頼。段に分けるなら段ごとに）
    const groupColumns = (chats: ChatBucket<PanelDraft>["chats"], laneDrafts: readonly PanelDraft[]) => (
      <ProjectGroupColumns projectId={projectId} chats={chats} drafts={laneDrafts} list={list} foldPlace={foldPlace} render={render} />
    );
    if (split) {
      return (
        <BoardLanes lanes={buckets} list={list} foldPlace={foldPlace}>
          {(lane) => groupColumns(lane.chats, lane.drafts)}
        </BoardLanes>
      );
    }
    return <div className={list ? "board-list" : "board-columns"}>{groupColumns(buckets[0]?.chats ?? [], drafts)}</div>;
  }
  if (byGroup) {
    // グループの列: プロジェクトの段ごとに、そのプロジェクトのグループの列（カードをドラッグしてグループを移す）
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
          lane.projectId === undefined ? null : (
            <ProjectGroupColumns projectId={lane.projectId} chats={lane.chats} drafts={lane.drafts} list={list} foldPlace={foldPlace} render={render} />
          )
        }
      </BoardLanes>
    );
  }
  if (split) {
    // 段に分ける: 段ごとに、ボードと同じく下書き（その段に入る作成先のもの）→ 状態の列を並べる（リストなら 下書き → 状態のまとまり → アーカイブ済み を縦に）
    return (
      <BoardLanes lanes={buckets} list={list} foldPlace={foldPlace} showProject={showLaneProject} {...laneReorder} {...(laneDrop ? { laneProps: laneDrop } : {})}>
        {(lane) =>
          flat ? (
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
