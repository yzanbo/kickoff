import { Plus, SquareKanban } from "lucide-react";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { BOARD_COLUMNS, type BoardColumn, type Run, type RunGroup } from "../../../../core/types";
import { useRunRename } from "../../hooks/useRunRename";
import { useTicker } from "../../hooks/useTicker";
import { projectHue } from "../../projectColor";
import { sidebarOrder } from "../../projectOrder";
import { useProjects } from "../../projectsContext";
import { useProjectTagFilter } from "../../projectTagFilter";
import { openRun, type ReopenRoute } from "../../router";
import { useRunStates } from "../../approvalsContext";
import { useProjectChatContext } from "../projectChat/useProjectChat";
import { DraftCards } from "../sidePanel/DraftCards";
import { boardPanelKey } from "../sidePanel/panelMemory";
import { useSidePanel, type NewChatTarget } from "../sidePanel/useSidePanel";
import { BoardColumnsToggle } from "./BoardColumnsToggle";
import { BoardHeader, useBoardView } from "./BoardHeader";
import { KanbanFilters } from "./KanbanFilters";
import { useBoardFocus } from "./useBoardFocus";
import { BoardLanes, LaneSelect } from "./BoardLanes";
import { byColumn, type BoardEntry } from "./boardColumns";
import { useKanbanEntries } from "./useKanbanEntries";
import { useKanbanFilters, useKanbanLanes, useWorktreeChoices } from "./useKanbanFilters";
import { BoardShell } from "./BoardShell";
import { ArchivedListSection, DraftColumn, StateColumn } from "./StateColumn";
import { useBoardCards, useCardMenu } from "./useBoardCards";
import { useBoardRuns } from "./useBoardRuns";

const NO_GROUPS: RunGroup[] = [];

interface Props {
  /** 未指定なら全プロジェクトのボード（カードにプロジェクト名を出す） */
  projectId?: number;
  /** 見出しの名前（全プロジェクトの画面だけ。プロジェクトのボードはタブの名前があるので出さない） */
  title?: string;
  /** 右側のパネルで開くチャット・新しいチャット（サイドバー・検索などから開いたとき） */
  focus?: ReopenRoute;
  /** 自分で作ったグループ（スイムレーンをグループで分けるとき。プロジェクトのボードだけ） */
  groups?: RunGroup[];
}

/**
 * チャットのカンバン。列（作業中・回答待ち・未読・既読）は AI の状態から自動で決まり、人は動かさない（boardColumnOf）。
 * カードの点はより細かい状態（順番待ち・エラーなど）。
 */
export function KanbanBoard({ projectId, title, focus, groups = NO_GROUPS }: Props) {
  const allProjects = projectId === undefined;
  // 全プロジェクトのボードでは、しまった（アーカイブした）プロジェクトを除いたサイドバーの並び（名前の引き当てはどのボードでも全プロジェクトから）。
  // サイドバーの「タグ」で絞り込んでいれば、合うプロジェクトだけ
  const { projects: allList, projectName } = useProjects();
  const tagFilter = useProjectTagFilter();
  const projects = useMemo(
    () => (allProjects ? sidebarOrder(allList).filter(tagFilter.matches) : allList),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- matches は selected だけで決まる
    [allList, allProjects, tagFilter.selected],
  );
  // チャットの状態と回答待ちの数（回答待ちの依頼は App が持つ）
  const { stateOf } = useRunStates();
  const [error, setError] = useState<string>();
  // 右クリックメニューの「名前を変更」は、カード・行の名前をその場で入力欄にする
  const rename = useRunRename(setError);
  // 絞り込み（アーカイブ・作業場所・名前）とボード／リスト／スイムレーン（覚えておく）
  const filters = useKanbanFilters();
  // 表示（ボード / リスト）と、段に分けるか（段の分け方はボードとリストで共通）
  const { view, split, setView, setSplit } = useBoardView();
  // 「アーカイブ済み」も、アーカイブを含めて読み込んでから、下で絞り込む
  const { runs, loaded } = useBoardRuns(projectId, filters.archive !== "active", setError);
  useTicker(30_000); // 経過時間の表示を進める
  const worktreeChoices = useWorktreeChoices(runs);
  // カードの右クリックメニュー
  const menu = useCardMenu();

  // 右側から出てくるパネル（チャット・新しいチャット・ブラウザのタブ）
  const panel = useSidePanel({
    memoryKey: boardPanelKey(projectId),
    // チャットのタブはサイドバーの一覧にそろえる（全プロジェクトのボードはすべてのプロジェクト）
    scope: projectId ?? "all",
    holdEsc: menu.isOpen,
    projects: allProjects ? projects : undefined,
    // 新しいチャットを送ったら、プロジェクトのボードでは URL もそのチャットにする
    onCreated: (run) => !allProjects && openRun(run.project_id, run.id, undefined, { replace: true }),
  });
  /** カードから開く。プロジェクトのボードでは URL もそのチャットにする（サイドバーで強調され、戻る・進むで行き来できる） */
  const open = (run: Run) => {
    panel.open(run);
    if (!allProjects) openRun(run.project_id, run.id, undefined, { replace: true });
  };

  // サイドバー・検索などから開いたチャット・新しいチャットを、パネルで開く
  useBoardFocus(
    focus,
    (target) => {
      if (target.name === "run") panel.open({ id: target.runId, project_id: target.projectId }, target.focus);
      else panel.openNew({ projectId: target.projectId, group: target.group });
    },
    !allProjects,
  );


  // 絞り込んだチャット（新しく動いた順）。全プロジェクトのボードでは、しまった（アーカイブした）プロジェクトのチャットを出さない
  const projectIds = useMemo(() => (allProjects ? new Set(projects.map((p) => p.id)) : undefined), [allProjects, projects]);
  const { entries } = useKanbanEntries({ runs, filters: { ...filters, matches: filters.search.matches }, stateOf, projectIds });
  const total = entries.length;
  // スイムレーンの段の分け方
  const { lanes, options: laneOptions, setLanes } = useKanbanLanes(allProjects);

  /** 見出しの「新規」: 右側のパネルで新しいチャットを始める（送ると作業中の列に入る） */
  function newChat() {
    // 全プロジェクトのボードでは、最近のプロジェクトで始める（パネルでバッジから選び直せる）
    const target = projectId ?? projects[0]?.id;
    if (target === undefined) return;
    // 画面は移らず、右側のパネルで始める
    panel.openNew({ projectId: target });
  }

  /** カード・リストの行（クリックで開く・右クリックでメニュー・名前をその場で変える。全プロジェクトのボードではプロジェクトの色と名前を付ける） */
  const cards = useBoardCards({
    panel,
    rename,
    menu,
    onOpen: open,
    classFor: () => (allProjects ? "with-project" : undefined),
    style: (run) => (allProjects ? ({ "--ws-hue": `${projectHue(run.project_id)}` } as CSSProperties) : undefined),
    projectName: (run) => (allProjects ? projectName(run.project_id) : undefined),
  });
  // まだ送っていない新しいチャット（右のパネル・プロジェクトのチャット欄で書いている途中。AI はまだ何もしていない）。いちばん左の「下書き」の列に出す
  const chat = useProjectChatContext();
  const sideDrafts = chat && projectId !== undefined && chat.projectId === projectId ? chat.panel : null;
  const draftCount = panel.drafts.length + (sideDrafts?.drafts.length ?? 0);
  /** 下書きのカード（filter があれば、その作成先のものだけ。スイムレーンの段ごと） */
  const draftCardsOf = (filter?: (target: NewChatTarget) => boolean) => (
    <>
      <DraftCards panel={panel} filter={filter} />
      {sideDrafts && chat && <DraftCards panel={sideDrafts} filter={filter} onShow={chat.showTab} />}
    </>
  );
  const draftCards = draftCardsOf();
  /** スイムレーン: 下書きの作成先と、段に入る下書きの数 */
  const draftTargets = [...panel.drafts, ...(sideDrafts?.drafts ?? [])].map((d) => d.target);
  const draftsIn = (filter: (target: NewChatTarget) => boolean) => draftTargets.filter(filter).length;
  /** アーカイブ済みのまとまりの開閉を覚える名前（ボード・段・列ごと） */
  const foldKey = (column: BoardColumn, laneKey = "") => `kanban:${projectId ?? "all"}:${laneKey}:${column}`;
  /** 状態の列（ボード・スイムレーンの段。アーカイブ済みは列のいちばん下の閉じたまとまりに分け、見出しの件数はアーカイブしていないものだけ） */
  const columns = (list: BoardEntry[], laneKey?: string) => {
    const grouped = byColumn(list);
    return BOARD_COLUMNS.map((column) => <StateColumn key={column} column={column} entries={grouped.get(column) ?? []} foldKey={foldKey(column, laneKey)} render={cards.card} />);
  };

  /** リスト表示のまとまり（下書き → 状態ごと → いちばん下にアーカイブ済みをまとめ、中を状態ごとに分ける）。段に分けるときは段ごと */
  const listSections = (list: BoardEntry[], laneKey: string, count: number, drafts: ReactNode) => {
    const grouped = byColumn(list);
    return (
      <>
        <DraftColumn count={count} list>
          {drafts}
        </DraftColumn>
        {BOARD_COLUMNS.map((column) => (
          <StateColumn key={column} column={column} entries={grouped.get(column) ?? []} foldKey={foldKey(column, laneKey)} render={cards.row} list foldArchived={false} />
        ))}
        <ArchivedListSection entries={list} foldKey={`kanban:${projectId ?? "all"}:${laneKey}-archived`} render={cards.row} />
      </>
    );
  };

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
        <button className="btn btn-sm" onClick={() => newChat()} disabled={allProjects && projects.length === 0}>
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
    <BoardShell header={header} error={error} panel={panel} onNewChat={() => newChat()} projectId={projectId} menu={menu} onOpenRun={open} rename={rename} onError={setError}>
      {!loaded ? (
        <p className="muted small board-loading">読み込み中…</p>
      ) : view === "board" && split ? (
        // 段に分ける: 段ごとに、ボードと同じく下書き（その段に入る作成先のもの）→ 状態の列を並べる
        <BoardLanes
          kind={lanes}
          boardKey={`${projectId ?? "all"}`}
          entries={entries}
          projects={projects}
          groups={groups}
          drafts={draftTargets}
          renderColumns={(list, laneKey, draft) => (
            <>
              <DraftColumn count={draftsIn(draft)}>{draftCardsOf(draft)}</DraftColumn>
              {columns(list, laneKey)}
            </>
          )}
        />
      ) : view === "board" ? (
        <div className="board-columns">
          <DraftColumn count={draftCount}>{draftCards}</DraftColumn>
          {columns(entries)}
        </div>
      ) : split ? (
        // リストを段に分ける: 段ごとに、下書き（その段に入る作成先のもの）→ 状態のまとまり → アーカイブ済み を縦に並べる
        <BoardLanes
          kind={lanes}
          list
          boardKey={`${projectId ?? "all"}`}
          entries={entries}
          projects={projects}
          groups={groups}
          drafts={draftTargets}
          renderColumns={(list, laneKey, draft) => listSections(list, laneKey, draftsIn(draft), draftCardsOf(draft))}
        />
      ) : (
        <div className="board-list">{listSections(entries, "list", draftCount, draftCards)}</div>
      )}
    </BoardShell>
  );
}
