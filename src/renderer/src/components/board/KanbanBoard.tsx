import { ChevronLeft, ChevronRight, Plus, SquareKanban } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { agentStateOf, stageOf } from "../../../../core/board";
import { BOARD_STAGE_LABELS, BOARD_STAGES, type AgentState, type Approval, type BoardStage, type Phase, type ProjectSummary, type Run } from "../../../../core/types";
import { api } from "../../api";
import { useChatSearch } from "../../chatSearch";
import { cx } from "../../cx";
import { errorMessage } from "../../errors";
import { useRunRename } from "../../hooks/useRunRename";
import { useStoredChoice, useStoredState } from "../../hooks/useStoredState";
import { useTicker } from "../../hooks/useTicker";
import { projectHue } from "../../projectColor";
import { openRun, type ReopenRoute } from "../../router";
import { CardMenu } from "../CardMenu";
import { ErrorText } from "../ErrorText";
import { IconButton } from "../IconButton";
import { DraftCards } from "../sidePanel/DraftCards";
import { SidePanel } from "../sidePanel/SidePanel";
import { useSidePanel } from "../sidePanel/useSidePanel";
import { BoardHeader, type BoardView } from "./BoardHeader";
import { decodeArchiveFilter, encodeArchiveFilter, KanbanFilters, type ArchiveFilter } from "./KanbanFilters";
import { RunCardContent, RunRowContent } from "./RunCard";
import { runCardProps } from "./runCardProps";
import { STAGE_TONE } from "./tones";
import { useBoardFocus } from "./useBoardFocus";
import { useBoardRuns } from "./useBoardRuns";
import { useStageDrag } from "./useStageDrag";

const VIEW_KEY = "kickoff:board-view";
const SHOW_ARCHIVED_KEY = "kickoff:show-archived";
const PROJECT_FILTER_KEY = "kickoff:board-project-filter";

interface Props {
  /** 未指定なら全プロジェクトのボード（カードにプロジェクト名を出す） */
  projectId?: number;
  projects: ProjectSummary[];
  approvals: Approval[];
  title: string;
  /** 右側のパネルで開くチャット・新しいチャット（サイドバー・検索などから開いたとき） */
  focus?: ReopenRoute;
}

/**
 * チャットのカンバン。列（未着手・対応中・レビュー・完了）はあなたが動かす進み具合で、
 * カードの点はエージェント自身の状態（回答待ち・作業中・確認待ちなど）。
 */
export function KanbanBoard({ projectId, projects, approvals, title, focus }: Props) {
  const allProjects = projectId === undefined;
  const [error, setError] = useState<string>();
  // 右クリックメニューの「名前を変更」は、カード・行の名前をその場で入力欄にする
  const rename = useRunRename(setError);
  // アーカイブでの絞り込み・ボード／リスト（覚えておく）
  const [archive, setArchive] = useStoredState<ArchiveFilter>(SHOW_ARCHIVED_KEY, decodeArchiveFilter, encodeArchiveFilter);
  const [view, setView] = useStoredChoice<BoardView>(VIEW_KEY, ["board", "list"], "board");
  // 「アーカイブ済み」も、アーカイブを含めて読み込んでから、下で絞り込む
  const { runs, loaded, setRuns } = useBoardRuns(projectId, archive !== "active", setError);
  useTicker(30_000); // 経過時間の表示を進める
  const [section, setSection] = useState<Phase | "all">("all");
  // 作業場所（ワークツリー）での絞り込み（"all" はすべて、"" は本体）
  const [worktreeFilter, setWorktreeFilter] = useState("all");
  const worktreePaths = useMemo(() => [...new Set(runs.map((r) => r.worktree_path).filter(Boolean))].sort(), [runs]);
  // 全プロジェクトのボードでの、プロジェクトの絞り込み（選んだものは覚えておく。"" はすべて）
  const [projectFilter, setProjectFilter] = useStoredState<number | "all">(
    PROJECT_FILTER_KEY,
    (raw) => Number(raw) || "all",
    (value) => String(value === "all" ? "" : value),
  );
  // 絞り込んでいたプロジェクトがなくなったら、すべてに戻す
  const activeProjectFilter = allProjects && projectFilter !== "all" && projects.some((p) => p.id === projectFilter) ? projectFilter : "all";
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
      else panel.openNew({ projectId: target.projectId, section: target.section, stage: target.stage, group: target.group });
    },
    !allProjects,
  );

  const projectName = (id: number) => projects.find((p) => p.id === id)?.name ?? "";
  const pendingFor = (run: Run) => approvals.filter((a) => a.run_id === run.id).length;

  const grouped = useMemo(() => {
    const map = new Map<BoardStage, { run: Run; state: AgentState }[]>(BOARD_STAGES.map((s) => [s, []]));
    for (const run of runs) {
      if (archive === "archived" && !run.archived_at) continue;
      if (worktreeFilter !== "all" && run.worktree_path !== worktreeFilter) continue;
      if (section !== "all" && run.phase !== section) continue;
      if (activeProjectFilter !== "all" && run.project_id !== activeProjectFilter) continue;
      if (!search.matches(run)) continue;
      const state = agentStateOf(run, approvals.some((a) => a.run_id === run.id));
      map.get(stageOf(run, state))?.push({ run, state });
    }
    for (const list of map.values()) list.sort((a, b) => b.run.updated_at.localeCompare(a.run.updated_at));
    return map;
  }, [runs, approvals, section, search, activeProjectFilter, archive, worktreeFilter]);
  const total = [...grouped.values()].reduce((n, l) => n + l.length, 0);

  async function move(run: Run, stage: BoardStage) {
    // 先に画面へ反映し、失敗したら戻す
    setRuns((prev) => prev.map((r) => (r.id === run.id ? { ...r, stage } : r)));
    try {
      await api.moveRun(run.id, stage);
    } catch (e) {
      setRuns((prev) => prev.map((r) => (r.id === run.id ? run : r)));
      setError(errorMessage(e));
    }
  }

  const neighbour = (stage: BoardStage, step: -1 | 1): BoardStage | null => BOARD_STAGES[BOARD_STAGES.indexOf(stage) + step] ?? null;

  /** 列の＋: その列に置く新しいチャット。見出しの「新規」は列を決めない（プロジェクトの既定に従う） */
  function newChat(stage?: BoardStage) {
    // 全プロジェクトのボードでは、絞り込んでいるプロジェクト（なければ最近のプロジェクト）で始める
    const target = projectId ?? (activeProjectFilter !== "all" ? activeProjectFilter : projects[0]?.id);
    if (target === undefined) return;
    // 画面は移らず、右側のパネルで始める
    panel.openNew({ projectId: target, stage, section: section === "all" ? undefined : section });
  }

  // カードを別の列へドラッグして移す
  const drag = useStageDrag(runs, (run, stage) => {
    if (stageOf(run, agentStateOf(run, pendingFor(run) > 0)) !== stage) void move(run, stage);
  });

  const cardProps = (run: Run) => ({
    ...runCardProps(run, {
      dragHint: "ドラッグで列を移動",
      onOpen: () => open(run),
      onMenu: (at) => setMenu({ ...at, run }),
      onDragStart: (e) => drag.start(e, run),
      onDragEnd: drag.end,
      editing: Boolean(rename.editorFor(run)),
    }),
    style: allProjects ? ({ "--ws-hue": `${projectHue(run.project_id)}` } as CSSProperties) : undefined,
  });
  const cardClass = (run: Run) =>
    cx(run.archived_at && "archived", allProjects && "with-project", drag.dragId === run.id && "dragging", panel.isShowing(run.id) && "selected", panel.hasTab(run.id) && "in-tab");
  const arrows = (run: Run, stage: BoardStage) => (
    <>
      <ArrowButton to={neighbour(stage, -1)} dir="prev" onMove={(to) => void move(run, to)} />
      <ArrowButton to={neighbour(stage, 1)} dir="next" onMove={(to) => void move(run, to)} />
    </>
  );
  /** 列・リストのまとまりの見出し（列の名前・件数・その列に新しいチャット） */
  const stageHead = (stage: BoardStage, count: number, plusTitle?: string) => (
    <header className="column-head">
      <span className="dot" style={{ background: STAGE_TONE[stage] }} />
      <span className="column-title">{BOARD_STAGE_LABELS[stage]}</span>
      <span className="column-count">{count}</span>
      <IconButton icon={Plus} label={`${BOARD_STAGE_LABELS[stage]}に新しいチャット`} title={plusTitle} onClick={() => newChat(stage)} />
    </header>
  );
  // 列の＋から始めて、まだ送っていない新しいチャット（その列に下書きとして出す）
  const drafts = (stage: BoardStage) => <DraftCards panel={panel} filter={(t) => t.stage === stage} />;

  return (
    <div className="board">
      <BoardHeader
        icon={<SquareKanban size={16} className="muted" />}
        title={title}
        count={total}
        query={query}
        onQuery={setQuery}
        filters={
          <KanbanFilters
            projects={allProjects && projects.length > 1 ? projects : undefined}
            projectFilter={activeProjectFilter}
            onProjectFilter={setProjectFilter}
            section={section}
            onSection={setSection}
            archive={archive}
            onArchive={setArchive}
            worktrees={worktreePaths}
            worktree={worktreeFilter}
            onWorktree={setWorktreeFilter}
          />
        }
        actions={
          <button className="btn btn-sm" onClick={() => newChat()} disabled={allProjects && projects.length === 0}>
            <Plus size={13} /> <span className="btn-label">新規</span>
          </button>
        }
        view={view}
        onView={setView}
        panel={panel}
      />
      <ErrorText message={error} className="board-error" />

      <div {...panel.body}>
        <div className="board-main">
          {!loaded ? (
            <p className="muted small board-loading">読み込み中…</p>
          ) : view === "board" ? (
            <div className="board-columns">
              {BOARD_STAGES.map((stage) => {
                const list = grouped.get(stage) ?? [];
                return (
                  <section key={stage} className={cx("board-column", drag.over === stage && "drop-target")} {...drag.dropProps(stage)}>
                    {stageHead(stage, list.length, `${BOARD_STAGE_LABELS[stage]}に新しいチャット`)}
                    <div className="column-cards">
                      {drafts(stage)}
                      {list.length === 0 && <p className="column-empty">なし</p>}
                      {list.map(({ run, state }) => (
                        <article key={run.id} className={cx("board-card", cardClass(run))} {...cardProps(run)}>
                          <RunCardContent
                            run={run}
                            state={state}
                            projectName={allProjects ? projectName(run.project_id) : undefined}
                            pending={pendingFor(run)}
                            trailing={arrows(run, stage)}
                            rename={rename.editorFor(run)}
                          />
                        </article>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="board-list">
              {BOARD_STAGES.map((stage) => {
                const list = grouped.get(stage) ?? [];
                return (
                  <section key={stage} className={cx("list-group", drag.over === stage && "drop-target")} {...drag.dropProps(stage)}>
                    {stageHead(stage, list.length)}
                    {drafts(stage)}
                    {list.length === 0 && <p className="column-empty">なし</p>}
                    {list.map(({ run, state }) => (
                      <div key={run.id} className={cx("list-row", cardClass(run))} {...cardProps(run)}>
                        <RunRowContent
                          run={run}
                          state={state}
                          projectName={allProjects ? projectName(run.project_id) : undefined}
                          trailing={arrows(run, stage)}
                            rename={rename.editorFor(run)}
                        />
                      </div>
                    ))}
                  </section>
                );
              })}
            </div>
          )}
        </div>
        <SidePanel panel={panel} onNewChat={() => newChat()} />
      </div>

      {menu && <CardMenu {...menu} onOpenPanel={open} onRename={rename.start} onClose={() => setMenu(null)} onError={setError} />}
    </div>
  );
}

/** カードの矢印（前後の列へ移す）。端の列では同じ幅の空きを置いて、時刻の位置をそろえる */
function ArrowButton({ to, dir, onMove }: { to: BoardStage | null; dir: "prev" | "next"; onMove: (to: BoardStage) => void }) {
  if (!to) return <span className="arrow-spacer" />;
  const label = dir === "prev" ? "前の列へ" : "次の列へ";
  return (
    <button className="arrow-button" title={`${label}（${BOARD_STAGE_LABELS[to]}）`} aria-label={label} onClick={() => onMove(to)}>
      {dir === "prev" ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
    </button>
  );
}
