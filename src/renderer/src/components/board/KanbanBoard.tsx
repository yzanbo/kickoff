import { Plus, SquareKanban } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { BOARD_COLUMN_LABELS, BOARD_COLUMNS, type Approval, type BoardColumn, type Phase, type Run, type RunGroup } from "../../../../core/types";
import { useChatSearch } from "../../chatSearch";
import { cx } from "../../cx";
import { useRunRename } from "../../hooks/useRunRename";
import { useStoredChoice, useStoredState } from "../../hooks/useStoredState";
import { useTicker } from "../../hooks/useTicker";
import { projectHue } from "../../projectColor";
import { sidebarOrder } from "../../projectOrder";
import { useProjects } from "../../projectsContext";
import { openRun, type ReopenRoute } from "../../router";
import { approvalIndex, runStateOf } from "../../runState";
import { BOARD_LANES_ALL_KEY, BOARD_LANES_KEY, BOARD_SHOW_ARCHIVED_KEY, BOARD_VIEW_KEY } from "../../storageKeys";
import { CardMenu } from "../menus/CardMenu";
import { ErrorText } from "../ErrorText";
import { useProjectChatContext } from "../projectChat/useProjectChat";
import { DraftCards } from "../sidePanel/DraftCards";
import { SidePanel } from "../sidePanel/SidePanel";
import { terminalTargets, useSidePanel } from "../sidePanel/useSidePanel";
import { BoardHeader, type BoardView } from "./BoardHeader";
import { decodeArchiveFilter, encodeArchiveFilter, KanbanFilters, type ArchiveFilter } from "./KanbanFilters";
import { RunCardContent, RunRowContent } from "./RunCard";
import { runCardProps } from "./runCardProps";
import { COLUMN_TONE, DRAFT_TONE } from "./tones";
import { useBoardFocus } from "./useBoardFocus";
import { ArchiveAllButton } from "./ArchiveAllButton";
import { BOARD_LANE_LABELS, BOARD_LANES, BoardLanes, type BoardLane } from "./BoardLanes";
import { byColumn, type BoardEntry } from "./boardColumns";
import { ColumnHead } from "./ColumnHead";
import { useBoardRuns } from "./useBoardRuns";
import { useWorktreeLists } from "../../worktree/worktreeBranches";
import { workplaceOf } from "../../worktree/workplace";
import { ArchivedFold, splitArchived } from "./ArchivedFold";

/** カンバン（列 = 状態）で選べる段の分け方 */
const KANBAN_LANES: BoardLane[] = ["worktree", "phase", "group", "project"];

type Entry = BoardEntry;
const NO_GROUPS: RunGroup[] = [];

interface Props {
  /** 未指定なら全プロジェクトのボード（カードにプロジェクト名を出す） */
  projectId?: number;
  approvals: Approval[];
  /** 見出しの名前（全プロジェクトの画面だけ。プロジェクトのボードはタブの名前があるので出さない） */
  title?: string;
  /** 右側のパネルで開くチャット・新しいチャット（サイドバー・検索などから開いたとき） */
  focus?: ReopenRoute;
  /** 自分で作ったグループ（スイムレーンをグループで分けるとき。プロジェクトのボードだけ） */
  groups?: RunGroup[];
}

/**
 * チャットのカンバン。列（作業中・回答待ち・確認待ち・完了）は AI の状態から自動で決まり、人は動かさない（boardColumnOf）。
 * カードの点はより細かい状態（順番待ち・エラーなど）。
 */
export function KanbanBoard({ projectId, approvals, title, focus, groups = NO_GROUPS }: Props) {
  const allProjects = projectId === undefined;
  // 全プロジェクトのボードでは、しまった（アーカイブした）プロジェクトを除いたサイドバーの並び（名前の引き当てはどのボードでも全プロジェクトから）
  const { projects: allList, projectName } = useProjects();
  const projects = useMemo(() => (allProjects ? sidebarOrder(allList) : allList), [allList, allProjects]);
  const [error, setError] = useState<string>();
  // 右クリックメニューの「名前を変更」は、カード・行の名前をその場で入力欄にする
  const rename = useRunRename(setError);
  // アーカイブでの絞り込み・ボード／リスト（覚えておく）
  const [archive, setArchive] = useStoredState<ArchiveFilter>(BOARD_SHOW_ARCHIVED_KEY, decodeArchiveFilter, encodeArchiveFilter);
  const [view, setView] = useStoredChoice<BoardView>(BOARD_VIEW_KEY, ["board", "list", "lanes"], "board");
  // 「アーカイブ済み」も、アーカイブを含めて読み込んでから、下で絞り込む
  const { runs, loaded } = useBoardRuns(projectId, archive !== "active", setError);
  useTicker(30_000); // 経過時間の表示を進める
  const [section, setSection] = useState<Phase | "all">("all");
  // 作業場所（ワークツリー）での絞り込み（"all" はすべて、"" は本体）
  const [worktreeFilter, setWorktreeFilter] = useState("all");
  // 絞り込みの候補: ワークツリーの作業場所（ブランチ名で出し、フォルダが消えたものは「フォルダなし」と添える）
  const worktreeRuns = runs.filter((r) => r.worktree_path);
  const worktreesOf = useWorktreeLists(worktreeRuns.map((r) => r.project_id));
  const worktreeChoices = [...new Map(worktreeRuns.map((r) => [r.worktree_path, r])).values()]
    .map((r) => {
      const place = workplaceOf(r, worktreesOf(r.project_id));
      return { path: r.worktree_path, label: place.kind === "missing" ? `${place.name}（フォルダなし）` : place.name };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
  const [query, setQuery] = useState("");
  const search = useChatSearch(query);
  const [menu, setMenu] = useState<{ x: number; y: number; run: Run } | null>(null);

  // 右側から出てくるパネル（チャット・新しいチャット・ブラウザのタブ）
  const panel = useSidePanel({
    memoryKey: `kanban:${projectId ?? "all"}`,
    runs,
    loaded,
    holdEsc: menu !== null,
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
      else panel.openNew({ projectId: target.projectId, section: target.section, group: target.group });
    },
    !allProjects,
  );

  const pendingFor = (run: Run) => approvals.filter((a) => a.run_id === run.id).length;

  // 絞り込んだチャット（新しく動いた順）
  const entries = useMemo(() => {
    const list: Entry[] = [];
    const pending = approvalIndex(approvals);
    for (const run of runs) {
      // 全プロジェクトのボードでは、しまった（アーカイブした）プロジェクトのチャットを出さない（projects に入っていない）
      if (allProjects && !projects.some((p) => p.id === run.project_id)) continue;
      if (archive === "archived" && !run.archived_at) continue;
      if (worktreeFilter !== "all" && run.worktree_path !== worktreeFilter) continue;
      if (section !== "all" && run.phase !== section) continue;
      if (!search.matches(run)) continue;
      list.push({ run, state: runStateOf(run, pending) });
    }
    return list.sort((a, b) => b.run.updated_at.localeCompare(a.run.updated_at));
  }, [runs, approvals, section, search, archive, worktreeFilter, allProjects, projects]);
  const grouped = useMemo(() => byColumn(entries), [entries]);
  const total = entries.length;
  // スイムレーンの段の分け方。プロジェクトで分けるのは全プロジェクトのボード、グループで分けるのはプロジェクトのボードだけ。
  // 全プロジェクトのボードは別に覚え、初めはプロジェクト（プロジェクト別のカンバン）。プロジェクトのボードは初めはセクション
  const laneOptions = KANBAN_LANES.filter((l) => (allProjects ? l !== "group" : l !== "project"));
  const defaultLane: BoardLane = allProjects ? "project" : "phase";
  const [laneChoice, setLanes] = useStoredChoice<BoardLane>(allProjects ? BOARD_LANES_ALL_KEY : BOARD_LANES_KEY, BOARD_LANES, defaultLane);
  const lanes: BoardLane = laneOptions.includes(laneChoice) ? laneChoice : defaultLane;

  /** 見出しの「新規」: 右側のパネルで新しいチャットを始める（送ると作業中の列に入る） */
  function newChat() {
    // 全プロジェクトのボードでは、最近のプロジェクトで始める（パネルでバッジから選び直せる）
    const target = projectId ?? projects[0]?.id;
    if (target === undefined) return;
    // 画面は移らず、右側のパネルで始める
    panel.openNew({ projectId: target, section: section === "all" ? undefined : section });
  }

  const cardProps = (run: Run) => ({
    ...runCardProps(run, {
      onOpen: () => open(run),
      onMenu: (at) => setMenu({ ...at, run }),
      editing: Boolean(rename.editorFor(run)),
    }),
    style: allProjects ? ({ "--ws-hue": `${projectHue(run.project_id)}` } as CSSProperties) : undefined,
  });
  const cardClass = (run: Run) =>
    cx(run.archived_at && "archived", allProjects && "with-project", panel.isShowing(run.id) && "selected", panel.hasTab(run.id) && "in-tab");
  /** 列・リストのまとまりの見出し（列の名前・件数） */
  // 完了の列には、すべてアーカイブするボタンを置く
  const columnHead = (column: BoardColumn, list: Entry[]) => (
    <ColumnHead
      label={BOARD_COLUMN_LABELS[column]}
      tone={COLUMN_TONE[column]}
      count={list.length}
      action={column === "done" ? <ArchiveAllButton runs={list.map((e) => e.run)} /> : undefined}
    />
  );
  // まだ送っていない新しいチャット（右のパネル・プロジェクトのチャット欄で書いている途中。AI はまだ何もしていない）。いちばん左の「下書き」の列に出す
  const chat = useProjectChatContext();
  const sideDrafts = chat && projectId !== undefined && chat.projectId === projectId ? chat.panel : null;
  const draftCount = panel.drafts.length + (sideDrafts?.drafts.length ?? 0);
  // 新しいチャットは見出しの「新規」から始める（列の＋は、押しても列に意味がないので置かない）
  const draftHead = <ColumnHead label="下書き" tone={DRAFT_TONE} count={draftCount} />;
  const draftCards = (
    <>
      <DraftCards panel={panel} />
      {sideDrafts && chat && <DraftCards panel={sideDrafts} onShow={chat.showTab} />}
      {draftCount === 0 && <p className="column-empty">なし</p>}
    </>
  );

  const card = ({ run, state }: Entry) => (
    <article key={run.id} className={cx("board-card", cardClass(run))} {...cardProps(run)}>
      <RunCardContent
        run={run}
        state={state}
        projectName={allProjects ? projectName(run.project_id) : undefined}
        pending={pendingFor(run)}
        rename={rename.editorFor(run)}
      />
    </article>
  );
  /** アーカイブ済みのまとまりの開閉を覚える名前（ボード・段・列ごと） */
  const foldKey = (column: BoardColumn, laneKey = "") => `kanban:${projectId ?? "all"}:${laneKey}:${column}`;
  /**
   * 状態の列 1 本（ボードの表示）。アーカイブ済みは列のいちばん下の閉じたまとまりに分ける（サイドバーと同じ）。
   * 見出しの件数は、アーカイブしていないものだけ
   */
  const columnSection = (column: BoardColumn, list: Entry[], laneKey?: string) => {
    const [active, archived] = splitArchived(list, (e) => e.run);
    return (
      <section key={column} className="board-column">
        {columnHead(column, active)}
        <div className="column-cards">
          {active.length === 0 && <p className="column-empty">なし</p>}
          {active.map(card)}
          <ArchivedFold foldKey={foldKey(column, laneKey)} count={archived.length}>
            {archived.map(card)}
          </ArchivedFold>
        </div>
      </section>
    );
  };
  const draftColumn = (
    <section className="board-column">
      {draftHead}
      <div className="column-cards">{draftCards}</div>
    </section>
  );

  return (
    <div className="board">
      <BoardHeader
        heading={title ? { icon: <SquareKanban size={16} className="muted" />, title, count: total } : undefined}
        query={query}
        onQuery={setQuery}
        filters={
          <KanbanFilters
            section={section}
            onSection={setSection}
            archive={archive}
            onArchive={setArchive}
            worktrees={worktreeChoices}
            worktree={worktreeFilter}
            onWorktree={setWorktreeFilter}
          />
        }
        primary={
          <button className="btn btn-sm" onClick={() => newChat()} disabled={allProjects && projects.length === 0}>
            <Plus size={13} /> <span className="btn-label">新規</span>
          </button>
        }
        view={view}
        onView={setView}
        lanesView
        viewOptions={
          view === "lanes" && (
            <select className="board-filter" aria-label="段の分け方" title="段の分け方" value={lanes} onChange={(e) => setLanes(e.target.value as BoardLane)}>
              {laneOptions.map((l) => (
                <option key={l} value={l}>
                  段: {BOARD_LANE_LABELS[l]}
                </option>
              ))}
            </select>
          )
        }
        panel={panel}
      />
      <ErrorText message={error} className="board-error" />

      <div {...panel.body}>
        <div className="board-main">
          {!loaded ? (
            <p className="muted small board-loading">読み込み中…</p>
          ) : view === "lanes" ? (
            // 段に分ける: 段ごとに状態の列を並べる。下書きはまだ段が決まらないので、あるときだけ上に置く
            <BoardLanes
              kind={lanes}
              boardKey={`${projectId ?? "all"}`}
              entries={entries}
              projects={projects}
              groups={groups}
              renderColumns={(list, laneKey) => {
                const columns = byColumn(list);
                return BOARD_COLUMNS.map((column) => columnSection(column, columns.get(column) ?? [], laneKey));
              }}
              before={draftCount > 0 && <div className="board-columns lane-columns">{draftColumn}</div>}
            />
          ) : view === "board" ? (
            <div className="board-columns">
              {draftColumn}
              {BOARD_COLUMNS.map((column) => columnSection(column, grouped.get(column) ?? []))}
            </div>
          ) : (
            <div className="board-list">
              <section className="list-group">
                {draftHead}
                {draftCards}
              </section>
              {BOARD_COLUMNS.map((column) => {
                const [active, archived] = splitArchived(grouped.get(column) ?? [], (e) => e.run);
                const row = ({ run, state }: Entry) => (
                  <div key={run.id} className={cx("list-row", cardClass(run))} {...cardProps(run)}>
                    <RunRowContent run={run} state={state} projectName={allProjects ? projectName(run.project_id) : undefined} rename={rename.editorFor(run)} />
                  </div>
                );
                return (
                  <section key={column} className="list-group">
                    {columnHead(column, active)}
                    {active.length === 0 && <p className="column-empty">なし</p>}
                    {active.map(row)}
                    <ArchivedFold foldKey={foldKey(column, "list")} count={archived.length}>
                      {archived.map(row)}
                    </ArchivedFold>
                  </section>
                );
              })}
            </div>
          )}
        </div>
        <SidePanel panel={panel} onNewChat={() => newChat()} terminals={terminalTargets(projects, projectId)} />
      </div>

      {menu && <CardMenu {...menu} onOpenPanel={open} onRename={rename.start} onClose={() => setMenu(null)} onError={setError} />}
    </div>
  );
}
