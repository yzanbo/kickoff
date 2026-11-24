import "./KanbanBody.css";
import { useBoard } from "./BoardContext";
import { BoardLanes } from "./BoardLanes";
import { FlatTasks } from "./FlatTasks";
import { LaneGroupCreate } from "./GroupCreateForm";
import { ProjectGroupColumns } from "./ProjectGroupColumns";
import { ListSections, StateColumns } from "./StateColumn";
import type { useBoardCards } from "./useBoardCards";
import type { useProjectLaneReorder } from "./useProjectLaneReorder";
import type { ChatBucket } from "@/features/chatList/ui";
import type { PlacedDraft } from "@/features/chatPanel/ui";

interface Props {
  buckets: ChatBucket<PlacedDraft>[];
  drafts: readonly PlacedDraft[];
  /** 作業場所の段にプロジェクト名を添える（いくつかのプロジェクトが並ぶ全プロジェクトのボード） */
  showLaneProject: boolean;
  foldPlace: string;
  cards: ReturnType<typeof useBoardCards>;
  laneReorder: ReturnType<typeof useProjectLaneReorder>;
  /** 段をグループの落とし先にする（プロジェクトのボードの段: グループ。useGroupLaneDrop の laneProps） */
  laneDrop?: (lane: ChatBucket<PlacedDraft>) => Record<string, unknown>;
}

/** 1 つのまとまり（段の中か、段に分けない全体）の中身 */
interface Part {
  chats: ChatBucket<PlacedDraft>["chats"];
  /** 状態の列（段の中なら段の子） */
  columns: ChatBucket<PlacedDraft>[];
  drafts: readonly PlacedDraft[];
  archivedKey: string;
  /** グループの列のプロジェクト（全プロジェクトのボードでは段のプロジェクト） */
  projectId: number | undefined;
}

/**
 * カンバン（プロジェクト・全プロジェクトで共通）の中身。外は段に分けるか、中は列の分け方（グループの列 / 分けない / 状態の列）で描き分ける。
 * 表示（ボード / リスト）は中の部品が受ける。分け方は BoardContext の layout（layout.ts の boardLayout）
 */
export function KanbanBody({ buckets, drafts, showLaneProject, foldPlace, cards, laneReorder, laneDrop }: Props) {
  const { kind, projectId, layout } = useBoard();
  const allProjects = kind === "all";
  const list = layout.view === "list";
  const render = list ? cards.row : cards.card;

  const part = ({ chats, columns, drafts: partDrafts, archivedKey, projectId: groupProject }: Part) => {
    // グループの列: グループを列にして並べ、カードのドラッグでグループを移す
    if (layout.byGroup)
      return groupProject === undefined ? null : (
        <ProjectGroupColumns projectId={groupProject} chats={chats} drafts={partDrafts} list={list} foldPlace={foldPlace} render={render} />
      );
    // 状態で分けない: 下書き → チャット（並び順）を 1 つの並びに（ボードはカードを幅に合わせて折り返し、リストは 1 列）
    if (layout.flat)
      return <FlatTasks chats={chats} drafts={partDrafts} list={list} showDraftProject={allProjects} foldPlace={foldPlace} archivedKey={archivedKey} render={render} />;
    // 状態の列（リストなら 下書き → 状態のまとまり → アーカイブ済み を縦に）
    return list ? (
      <ListSections columns={columns} drafts={partDrafts} showDraftProject={allProjects} foldPlace={foldPlace} archivedKey={archivedKey} render={cards.row} />
    ) : (
      <StateColumns columns={columns} drafts={partDrafts} showDraftProject={allProjects} foldPlace={foldPlace} render={cards.card} />
    );
  };

  // 段に分ける（全プロジェクトのボードのグループの列は、いつもプロジェクトの段の中で、そのプロジェクトのグループに分ける）
  if (layout.laneSplit || (layout.byGroup && allProjects)) {
    return (
      <BoardLanes
        lanes={buckets}
        list={list}
        foldPlace={foldPlace}
        showProject={showLaneProject}
        {...laneReorder}
        {...(laneDrop ? { laneProps: laneDrop } : {})}
        // 「グループを作成」は段の見出しのプロジェクト名の右に置く（全プロジェクトのボードのグループの列）
        actions={layout.byGroup && allProjects ? (lane) => lane.projectId !== undefined && <LaneGroupCreate projectId={lane.projectId} /> : undefined}
      >
        {(lane) =>
          part({ chats: lane.chats, columns: lane.children ?? [], drafts: lane.drafts, archivedKey: `${lane.key}/archived`, projectId: allProjects ? lane.projectId : projectId })
        }
      </BoardLanes>
    );
  }
  return (
    <div className={list ? "board-list" : layout.flat ? "board-flat" : "board-columns"}>
      {part({ chats: buckets[0]?.chats ?? [], columns: buckets, drafts, archivedKey: layout.flat ? "flat/archived" : "archived", projectId })}
    </div>
  );
}
