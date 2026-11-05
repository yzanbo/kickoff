import { Plus, SquareKanban } from "lucide-react";
import { useMemo, useState } from "react";
import { useChatRename } from "@/features/chat/useChatRename";
import { useTicker } from "@/hooks/useTicker";
import { useProjects } from "@/stores/projects";
import { useVisibleProjects } from "@/features/project/useVisibleProjects";
import type { ReopenRoute } from "@/app/router";
import { useBoardPanel } from "@/features/panel/board/useBoardPanel";
import { BoardColumnsToggle } from "./BoardColumnsToggle";
import { BoardHeader, useBoardView } from "./BoardHeader";
import { KanbanFilters } from "./KanbanFilters";
import { BoardLanes, LaneSelect } from "./BoardLanes";
import { useChatBuckets } from "@/features/chatList/useChatBuckets";
import type { BucketHead } from "@/features/chatList/buckets";
import { useKanbanChats } from "./useKanbanChats";
import { useKanbanFilters, useKanbanLanes, useWorktreeChoices } from "./useKanbanFilters";
import { BoardShell } from "./BoardShell";
import { ListSections, StateColumns } from "./StateColumn";
import { useBoardCards, useCardMenu } from "./useBoardCards";
import { useChats } from "@/stores/chats";

interface Props {
  /** 未指定なら全プロジェクトのボード（カードにプロジェクト名を出す） */
  projectId?: number;
  /** 見出しの名前（全プロジェクトの画面だけ。プロジェクトのボードはタブの名前があるので出さない） */
  title?: string;
  /** 右側のパネルで開くチャット・新しいチャット（サイドバー・検索などから開いたとき） */
  focus?: ReopenRoute;
}

/** 状態の列は、チャットがなくてもすべて出す（段・グループはチャットか下書きのあるものだけ） */
const keepColumns = (head: BucketHead) => head.kind === "status";

/**
 * チャットのカンバン。列（作業中・回答待ち・未読・既読）は AI の状態から自動で決まり、人は動かさない（boardColumnOf）。
 * カードの点はより細かい状態（順番待ち・エラーなど）。
 */
export function KanbanBoard({ projectId, title, focus }: Props) {
  const allProjects = projectId === undefined;
  // 全プロジェクトのボードに出すプロジェクト: しまった（アーカイブした）ものを除いたサイドバーの並び。サイドバーの「タグ」で絞り込んでいれば、合うものだけ
  // （使うのは全プロジェクトのボードだけ。名前の引き当てはどのボードでも全プロジェクトから）
  const { projectName } = useProjects();
  const { visible: projects } = useVisibleProjects();
  const [error, setError] = useState<string>();
  // 右クリックメニューの「名前を変更」は、カード・行の名前をその場で入力欄にする
  const rename = useChatRename(setError);
  // 絞り込み（アーカイブ・作業場所・名前）とボード／リスト／スイムレーン（覚えておく）
  const filters = useKanbanFilters();
  // 表示（ボード / リスト）と、段に分けるか（段の分け方はボードとリストで共通）
  const { view, split, setView, setSplit } = useBoardView();
  // 「アーカイブ済み」も、アーカイブを含めて読み込んでから、下で絞り込む
  const { chats, loaded, error: loadError } = useChats({ projectId, archived: filters.archive !== "active" });
  useTicker(30_000); // 経過時間の表示を進める
  const worktreeChoices = useWorktreeChoices(chats);
  // カードの右クリックメニュー
  const menu = useCardMenu();

  // 右側から出てくるパネル（チャット・新しいチャット・ブラウザのタブ。チャットのタブはサイドバーの一覧にそろえる）と、
  // まだ送っていない新しいチャット（右のパネル・プロジェクトのチャット欄で書いている途中。AI はまだ何もしていない。いちばん左の「下書き」の列に出す）
  // カードから開く（open）・新しいチャットを送ると、プロジェクトのボードでは URL もそのチャットにする。サイドバー・検索などから開いたもの（focus）もパネルで開く
  const { panel, drafts, frame, body, open } = useBoardPanel({ projectId, holdEsc: menu.isOpen, projects: allProjects ? projects : undefined, focus });


  // 絞り込んだチャット。全プロジェクトのボードでは、しまった（アーカイブした）プロジェクトのチャットを出さない
  const projectIds = useMemo(() => (allProjects ? new Set(projects.map((p) => p.id)) : undefined), [allProjects, projects]);
  const shown = useKanbanChats({ chats, filters: { ...filters, matches: filters.search.matches }, projectIds });
  const total = shown.length;
  // スイムレーンの段の分け方
  const { lanes, options: laneOptions, setLanes } = useKanbanLanes(allProjects);

  /** カード・リストの行（クリックで開く・右クリックでメニュー・名前をその場で変える。全プロジェクトのボードではプロジェクトのバッジ（印と名前）を付ける） */
  const cards = useBoardCards({
    panel,
    rename,
    menu,
    onOpen: open,
    projectName: (chat) => (allProjects ? projectName(chat.project_id) : undefined),
  });
  // 状態の列（段に分けるときは、段（作業場所・グループ・プロジェクト）ごとに状態の列。段には、その段に入る作成先の下書きも入る）
  const buckets = useChatBuckets(shown, {
    by: split ? [lanes, "status"] : "status",
    project: projectId,
    projects: allProjects ? projects : undefined,
    drafts,
    keepEmpty: keepColumns,
  });
  /** 段・アーカイブ済みのまとまりの開閉を覚える場所（ボードごと。列・段はまとまりのキーで分ける） */
  const foldPlace = `board:${panel.key}`;

  const header = (
    <BoardHeader
      heading={title ? { icon: <SquareKanban size={16} className="muted" />, title, count: total } : undefined}
      query={filters.query}
      onQuery={filters.setQuery}
      filters={
        <KanbanFilters
          archive={filters.archive}
          onArchive={filters.setArchive}
          worktrees={worktreeChoices}
          worktree={filters.worktree}
          onWorktree={filters.setWorktree}
        />
      }
      primary={
        // 画面は移らず、右側のパネルで新しいチャットを始める（全プロジェクトのボードでは、最近のプロジェクトで。パネルでバッジから選び直せる。
        // 始められるプロジェクトがなければ、押せなくせずに、チャットはプロジェクトの中で始めることを案内する）
        <button className="btn btn-sm" onClick={panel.startNewChat}>
          <Plus size={13} /> <span className="btn-label">新規</span>
        </button>
      }
      view={view}
      onView={setView}
      columns={projectId !== undefined && <BoardColumnsToggle projectId={projectId} value="state" />}
      viewOptions={
        <LaneSelect
          value={split ? lanes : "none"}
          options={laneOptions}
          onChange={(next) => {
            if (next !== "none") setLanes(next);
            setSplit(next !== "none");
          }}
        />
      }
      panel={panel}
    />
  );

  return (
    <BoardShell header={header} error={error ?? loadError} panel={panel} frame={frame} body={body} menu={menu} onOpenChat={open} rename={rename} onError={setError}>
      {!loaded ? (
        <p className="muted small board-loading">読み込み中…</p>
      ) : split ? (
        // 段に分ける: 段ごとに、ボードと同じく下書き（その段に入る作成先のもの）→ 状態の列を並べる（リストなら 下書き → 状態のまとまり → アーカイブ済み を縦に）
        // 作業場所の段にプロジェクト名を添えるのは、いくつかのプロジェクトが並ぶ全プロジェクトのボードだけ
        <BoardLanes lanes={buckets} list={view === "list"} foldPlace={foldPlace} showProject={allProjects && projects.length > 1}>
          {(lane) =>
            view === "board" ? (
              <StateColumns columns={lane.children ?? []} drafts={lane.drafts} foldPlace={foldPlace} render={cards.card} />
            ) : (
              <ListSections columns={lane.children ?? []} drafts={lane.drafts} foldPlace={foldPlace} archivedKey={`${lane.key}/archived`} render={cards.row} />
            )
          }
        </BoardLanes>
      ) : view === "board" ? (
        <div className="board-columns">
          <StateColumns columns={buckets} drafts={drafts} foldPlace={foldPlace} render={cards.card} />
        </div>
      ) : (
        <div className="board-list">
          <ListSections columns={buckets} drafts={drafts} foldPlace={foldPlace} archivedKey="archived" render={cards.row} />
        </div>
      )}
    </BoardShell>
  );
}
