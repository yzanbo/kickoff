import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, List, Pencil, PanelRight, Plus, Search, SquareKanban, Trash2, Globe, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { agentStateOf, stageOf } from "../../../core/board";
import {
  AGENT_STATE_LABELS,
  BOARD_STAGE_LABELS,
  BOARD_STAGES,
  PHASES,
  type AgentState,
  type Approval,
  type BoardStage,
  type Phase,
  type ProjectSummary,
  type Run,
  type SearchHit,
} from "../../../core/types";
import { api } from "../api";
import { Highlight, useChatSearch } from "../chatSearch";
import { useServerEvent } from "../events";
import { openRun, REOPEN_EVENT, type ReopenRoute } from "../router";
import { SECTION_META } from "../sections";
import { relativeTime } from "./RunList";
import { projectHue } from "../projectColor";
import { ProjectChip } from "./ProjectChip";
import { SectionBadge } from "./SectionBadge";
import { DraftCard, useSidePanel } from "./SidePanel";
import { confirmDialog, promptDialog } from "../dialogs";

type ViewMode = "board" | "list";

/** 列の色（状態の点の色を流用。完了は控えめ） */
const STAGE_TONE: Record<BoardStage, string> = {
  todo: "var(--extra-muted)",
  doing: "var(--dot-running)",
  review: "var(--dot-needs-input)",
  done: "var(--dot-attention)",
};

export const STATE_TONE: Record<AgentState, string> = {
  needs_input: "var(--dot-needs-input)",
  failed: "var(--dot-failed)",
  running: "var(--dot-running)",
  attention: "var(--dot-attention)",
  done: "var(--extra-muted)",
};

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
/** ボードごとの直前のチャット（プロジェクトを切り替えたときに、すぐ出すため） */
const runsCache = new Map<string, Run[]>();

const SHOW_ARCHIVED_KEY = "kickoff:show-archived";
const PROJECT_FILTER_KEY = "kickoff:board-project-filter";

export function KanbanBoard({ projectId, projects, approvals, title, focus }: Props) {
  // 一度開いたボードのチャットは覚えておき、切り替えたときにすぐ出す（裏で読み直す）
  // アーカイブしたチャットも出すか（覚えておく）
  const [showArchived, setShowArchived] = useState(() => localStorage.getItem(SHOW_ARCHIVED_KEY) === "1");
  const toggleArchived = () => {
    localStorage.setItem(SHOW_ARCHIVED_KEY, showArchived ? "0" : "1");
    setShowArchived(!showArchived);
  };
  const cacheKey = `${projectId ?? "all"}${showArchived ? ":archived" : ""}`;
  const [state, setState] = useState(() => ({ key: cacheKey, runs: runsCache.get(cacheKey) ?? [], loaded: runsCache.has(cacheKey) }));
  // 切り替えた直後（まだ前のボードの状態のとき）も、覚えている内容を最初の描画から使う
  const current = state.key === cacheKey ? state : { key: cacheKey, runs: runsCache.get(cacheKey) ?? [], loaded: runsCache.has(cacheKey) };
  const runs = current.runs;
  const loaded = current.loaded;
  const setRuns = (update: Run[] | ((prev: Run[]) => Run[])) =>
    setState((prev) => {
      const base = prev.key === cacheKey ? prev.runs : (runsCache.get(cacheKey) ?? []);
      const next = typeof update === "function" ? update(base) : update;
      runsCache.set(cacheKey, next);
      return { key: cacheKey, runs: next, loaded: true };
    });
  const [view, setView] = useState<ViewMode>(() => (localStorage.getItem("kickoff:board-view") === "list" ? "list" : "board"));
  const [section, setSection] = useState<Phase | "all">("all");
  // 全プロジェクトのボードでの、プロジェクトの絞り込み（選んだものは覚えておく）
  const [projectFilter, setProjectFilter] = useState<number | "all">(() => Number(localStorage.getItem(PROJECT_FILTER_KEY)) || "all");
  const changeProjectFilter = (value: number | "all") => {
    localStorage.setItem(PROJECT_FILTER_KEY, String(value === "all" ? "" : value));
    setProjectFilter(value);
  };
  // 絞り込んでいたプロジェクトがなくなったら、すべてに戻す
  const activeProjectFilter = projectId === undefined && projectFilter !== "all" && projects.some((p) => p.id === projectFilter) ? projectFilter : "all";
  // カンバン内の検索（チャット名とやり取りの中身）
  const [query, setQuery] = useState("");
  const search = useChatSearch(query, projectId);
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<BoardStage | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; run: Run } | null>(null);
  const [error, setError] = useState<string>();
  const [, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setState({ key: cacheKey, runs: runsCache.get(cacheKey) ?? [], loaded: runsCache.has(cacheKey) });
    (projectId === undefined ? api.allRuns({ archived: showArchived }) : api.runs(projectId, { archived: showArchived }))
      .then((list) => alive && setRuns(list))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    // 経過時間の表示を進める
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [projectId, showArchived]);

  useEffect(() => localStorage.setItem("kickoff:board-view", view), [view]);

  useServerEvent((e) => {
    if (e.type === "run" && (projectId === undefined || e.run.project_id === projectId)) {
      setRuns((prev) => {
        const rest = prev.filter((r) => r.id !== e.run.id);
        // アーカイブしたチャットは、表示しているときだけ残す
        return e.run.archived_at && !showArchived ? rest : [e.run, ...rest];
      });
    } else if (e.type === "run_deleted") {
      setRuns((prev) => prev.filter((r) => r.id !== e.id));
    }
  });

  // 右側から出てくるパネル（チャット・ブラウザのタブ）
  const panel = useSidePanel({
    runs,
    loaded,
    holdEsc: menu !== null,
    projects: projectId === undefined ? projects : undefined,
    // 新しいチャットを送ったら、プロジェクトのボードでは URL もそのチャットにする
    onCreated: (run) => projectId !== undefined && openRun(run.project_id, run.id, undefined, { replace: true }),
  });
  /** カードから開く。プロジェクトのボードでは URL もそのチャットにする（サイドバーで強調され、戻る・進むで行き来できる） */
  const open = (run: Run) => {
    panel.open(run);
    if (projectId !== undefined) openRun(run.project_id, run.id, undefined, { replace: true });
  };

  /** 列の＋から始めて、まだ送っていない新しいチャット（その列に下書きとして出す） */
  const draftsOf = (stage: BoardStage) =>
    panel.drafts
      .filter((d) => d.target.stage === stage)
      .map((d) => (
        <DraftCard key={d.key} active={panel.isShowingTab(d.key)} onOpen={() => panel.showTab(d.key)} onDelete={() => panel.closeTab(d.key)} />
      ));

  // サイドバー・検索などから開いたチャット・新しいチャットを、パネルで開く
  const openFocus = (target: ReopenRoute) => {
    if (target.name === "run") panel.open({ id: target.runId, project_id: target.projectId }, target.focus);
    else panel.openNew({ projectId: target.projectId, section: target.section, stage: target.stage, group: target.group });
  };
  const focusKey = focus ? JSON.stringify(focus) : "";
  useEffect(() => {
    if (focus && projectId !== undefined) openFocus(focus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, projectId]);
  useEffect(() => {
    if (projectId === undefined) return;
    const onReopen = (e: Event) => openFocus((e as CustomEvent<ReopenRoute>).detail);
    window.addEventListener(REOPEN_EVENT, onReopen);
    return () => window.removeEventListener(REOPEN_EVENT, onReopen);
  });

  const projectName = (id: number) => projects.find((p) => p.id === id)?.name ?? "";
  const pendingFor = (run: Run) => approvals.filter((a) => a.run_id === run.id).length;

  const grouped = useMemo(() => {
    const map = new Map<BoardStage, { run: Run; state: AgentState }[]>(BOARD_STAGES.map((s) => [s, []]));
    for (const run of runs) {
      if (section !== "all" && run.phase !== section) continue;
      if (activeProjectFilter !== "all" && run.project_id !== activeProjectFilter) continue;
      if (!search.matches(run)) continue;
      const state = agentStateOf(run, approvals.some((a) => a.run_id === run.id));
      map.get(stageOf(run, state))?.push({ run, state });
    }
    for (const list of map.values()) list.sort((a, b) => b.run.updated_at.localeCompare(a.run.updated_at));
    return map;
  }, [runs, approvals, section, search, activeProjectFilter]);

  async function move(run: Run, stage: BoardStage) {
    // 先に画面へ反映し、失敗したら戻す
    setRuns((prev) => prev.map((r) => (r.id === run.id ? { ...r, stage } : r)));
    try {
      await api.moveRun(run.id, stage);
    } catch (e) {
      setRuns((prev) => prev.map((r) => (r.id === run.id ? run : r)));
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const neighbour = (stage: BoardStage, step: -1 | 1): BoardStage | null => BOARD_STAGES[BOARD_STAGES.indexOf(stage) + step] ?? null;

  /** 列の＋: その列に置く新しいチャット。見出しの「新規」は列を決めない（プロジェクトの既定に従う）。全体ボードでは最近のプロジェクトで始める */
  function newChat(stage?: BoardStage) {
    // 全プロジェクトのボードでは、絞り込んでいるプロジェクト（なければ最近のプロジェクト）で始める
    const target = projectId ?? (activeProjectFilter !== "all" ? activeProjectFilter : projects[0]?.id);
    if (target === undefined) return;
    // 画面は移らず、右側のパネルで始める
    panel.openNew({ projectId: target, stage, section: section === "all" ? undefined : section });
  }

  const dropProps = (stage: BoardStage) => ({
    onDragOver: (e: DragEvent) => {
      if (dragId === null) return;
      e.preventDefault();
      if (over !== stage) setOver(stage);
    },
    onDragLeave: (e: DragEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === stage ? null : o));
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const run = runs.find((r) => r.id === dragId);
      if (run) {
        const current = stageOf(run, agentStateOf(run, pendingFor(run) > 0));
        if (current !== stage) void move(run, stage);
      }
      setDragId(null);
      setOver(null);
    },
  });

  /**
   * カード（リストの行も同じ）の操作をカード全体でそろえる:
   * ドラッグ = 列の移動 / クリック = チャットを開く / 右クリック = メニュー。
   * 中の矢印ボタンだけは列の移動ボタンとして働く。
   */
  const cardProps = (run: Run) => ({
    role: "button",
    tabIndex: 0,
    "aria-label": `チャット「${run.title || "無題のチャット"}」を開く（ドラッグで列を移動）`,
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(run.id));
      setDragId(run.id);
    },
    onDragEnd: () => {
      setDragId(null);
      setOver(null);
    },
    onClick: (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("button")) open(run);
    },
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
      if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
        e.preventDefault();
        open(run);
      }
    },
    onContextMenu: (e: MouseEvent) => openMenu(e, run),
  });

  const openMenu = (e: MouseEvent, run: Run) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, run });
  };

  const total = [...grouped.values()].reduce((n, l) => n + l.length, 0);

  return (
    <div className="board">
      <div className="board-header">
        <SquareKanban size={16} className="muted" />
        <span className="board-title">{title}</span>
        <span className="muted small">{total} 件</span>
        <span className="spacer" />
        <BoardSearch query={query} onChange={setQuery} />
        {projectId === undefined && projects.length > 1 && (
          <select
            className={`board-filter ${activeProjectFilter !== "all" ? "filtered" : ""}`}
            aria-label="プロジェクトで絞り込み"
            value={activeProjectFilter}
            onChange={(e) => changeProjectFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
          >
            <option value="all">すべてのプロジェクト</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <select className="board-filter" aria-label="セクションで絞り込み" value={section} onChange={(e) => setSection(e.target.value as Phase | "all")}>
          <option value="all">すべてのセクション</option>
          {PHASES.map((p) => (
            <option key={p} value={p}>
              {SECTION_META[p].label}
            </option>
          ))}
        </select>
        <button className="btn btn-sm" onClick={panel.openBrowser} title="開発中のアプリやドキュメントを右側で開く">
          <Globe size={13} /> ブラウザ
        </button>
        <button className="btn btn-sm" onClick={() => newChat()} disabled={projectId === undefined && projects.length === 0}>
          <Plus size={13} /> 新規
        </button>
        <div className="view-toggle" role="group" aria-label="表示の切り替え">
          <button className={view === "board" ? "active" : ""} aria-pressed={view === "board"} onClick={() => setView("board")}>
            <SquareKanban size={13} /> ボード
          </button>
          <button className={view === "list" ? "active" : ""} aria-pressed={view === "list"} onClick={() => setView("list")}>
            <List size={13} /> リスト
          </button>
        </div>
        <button
          className={`icon-button archived-toggle ${showArchived ? "active" : ""}`}
          title={showArchived ? "アーカイブしたチャットを隠す" : "アーカイブしたチャットも表示する"}
          aria-label={showArchived ? "アーカイブしたチャットを隠す" : "アーカイブしたチャットも表示する"}
          aria-pressed={showArchived}
          onClick={toggleArchived}
        >
          <Archive size={15} />
        </button>
        {panel.toggleButton}
      </div>
      {error && <p className="error small board-error">{error}</p>}

      <div {...panel.body}>
      <div className="board-main">
      {!loaded ? (
        <p className="muted small board-loading">読み込み中…</p>
      ) : view === "board" ? (
        <div className="board-columns">
          {BOARD_STAGES.map((stage) => {
            const list = grouped.get(stage) ?? [];
            return (
              <section key={stage} className={`board-column ${over === stage ? "drop-target" : ""}`} {...dropProps(stage)}>
                <header className="column-head">
                  <span className="dot" style={{ background: STAGE_TONE[stage] }} />
                  <span className="column-title">{BOARD_STAGE_LABELS[stage]}</span>
                  <span className="column-count">{list.length}</span>
                  <button className="icon-button" title={`${BOARD_STAGE_LABELS[stage]}に新しいチャット`} aria-label={`${BOARD_STAGE_LABELS[stage]}に新しいチャット`} onClick={() => newChat(stage)}>
                    <Plus size={14} />
                  </button>
                </header>
                <div className="column-cards">
                  {draftsOf(stage)}
                  {list.length === 0 && <p className="column-empty">なし</p>}
                  {list.map(({ run, state }) => (
                    <article
                      key={run.id}
                      style={projectId === undefined ? ({ "--ws-hue": `${projectHue(run.project_id)}` } as React.CSSProperties) : undefined}
                      className={`board-card ${run.archived_at ? "archived" : ""} ${projectId === undefined ? "with-project" : ""} ${dragId === run.id ? "dragging" : ""} ${panel.isShowing(run.id) ? "selected" : ""} ${panel.hasTab(run.id) ? "in-tab" : ""}`}
                      {...cardProps(run)}
                    >
                      <span className="card-title">{run.title || "無題のチャット"}</span>
                      <CardSnippet hit={search.snippetFor(run)} />
                      <div className="card-labels">
                        {projectId === undefined && <ProjectChip id={run.project_id} name={projectName(run.project_id)} />}
                        <SectionBadge section={run.phase} short />
                        {run.archived_at && <span className="archived-chip">アーカイブ済み</span>}
                      </div>
                      <div className="card-foot">
                        <span className="dot" style={{ background: STATE_TONE[state] }} />
                        <span className="card-state">{AGENT_STATE_LABELS[state]}</span>
                        {pendingFor(run) > 0 && <span className="card-pending">回答 {pendingFor(run)}件</span>}
                        <span className="card-time">{relativeTime(run.updated_at)}</span>
                        <ArrowButton to={neighbour(stage, -1)} dir="prev" onMove={(to) => void move(run, to)} />
                        <ArrowButton to={neighbour(stage, 1)} dir="next" onMove={(to) => void move(run, to)} />
                      </div>
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
              <section key={stage} className={`list-group ${over === stage ? "drop-target" : ""}`} {...dropProps(stage)}>
                <header className="column-head">
                  <span className="dot" style={{ background: STAGE_TONE[stage] }} />
                  <span className="column-title">{BOARD_STAGE_LABELS[stage]}</span>
                  <span className="column-count">{list.length}</span>
                  <button className="icon-button" aria-label={`${BOARD_STAGE_LABELS[stage]}に新しいチャット`} onClick={() => newChat(stage)}>
                    <Plus size={14} />
                  </button>
                </header>
                {draftsOf(stage)}
                  {list.length === 0 && <p className="column-empty">なし</p>}
                {list.map(({ run, state }) => (
                  <div
                    key={run.id}
                    style={projectId === undefined ? ({ "--ws-hue": `${projectHue(run.project_id)}` } as React.CSSProperties) : undefined}
                    className={`list-row ${run.archived_at ? "archived" : ""} ${projectId === undefined ? "with-project" : ""} ${dragId === run.id ? "dragging" : ""} ${panel.isShowing(run.id) ? "selected" : ""} ${panel.hasTab(run.id) ? "in-tab" : ""}`}
                    {...cardProps(run)}
                  >
                    <div className="list-main">
                      <span className="card-title one-line">{run.title || "無題のチャット"}</span>
                      <CardSnippet hit={search.snippetFor(run)} />
                      <span className="list-meta">
                        {projectId === undefined && <ProjectChip id={run.project_id} name={projectName(run.project_id)} />}
                        <SectionBadge section={run.phase} short />
                        {run.archived_at && <span className="archived-chip">アーカイブ済み</span>}
                        <span className="dot" style={{ background: STATE_TONE[state] }} />
                        <span className="muted small">{AGENT_STATE_LABELS[state]}</span>
                      </span>
                    </div>
                    <span className="card-time">{relativeTime(run.updated_at)}</span>
                    <ArrowButton to={neighbour(stage, -1)} dir="prev" onMove={(to) => void move(run, to)} />
                    <ArrowButton to={neighbour(stage, 1)} dir="next" onMove={(to) => void move(run, to)} />
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      )}

      </div>
      {panel.renderPanel()}
      </div>

      {menu && <CardMenu {...menu} onOpenPanel={open} onClose={() => setMenu(null)} onError={setError} />}
    </div>
  );
}

/** ボードの見出しの検索欄（Esc で消す） */
export function BoardSearch({ query, onChange }: { query: string; onChange: (q: string) => void }) {
  return (
    <div className="chat-search board-search">
      <Search size={13} className="muted" aria-hidden />
      <input
        type="text"
        value={query}
        placeholder="チャットを検索（⌘F）"
        aria-label="このボードのチャットを検索"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && query) {
            // パネルを閉じる Esc より先に、検索語を消す
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            onChange("");
          }
        }}
      />
      {query && (
        <button className="chat-search-clear" aria-label="検索を解除" onClick={() => onChange("")}>
          <X size={12} />
        </button>
      )}
    </div>
  );
}

/** 中身だけが検索に一致したカードに、一致した部分を出す */
export function CardSnippet({ hit }: { hit: SearchHit | undefined }) {
  if (!hit) return null;
  return (
    <span className="card-snippet">
      <Highlight hit={hit} />
    </span>
  );
}

function ArrowButton({ to, dir, onMove }: { to: BoardStage | null; dir: "prev" | "next"; onMove: (to: BoardStage) => void }) {
  if (!to) return <span className="arrow-spacer" />;
  const label = dir === "prev" ? "前の列へ" : "次の列へ";
  return (
    <button className="arrow-button" title={`${label}（${BOARD_STAGE_LABELS[to]}）`} aria-label={label} onClick={() => onMove(to)}>
      {dir === "prev" ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
    </button>
  );
}

/** カードの右クリックメニュー: 開く・名前を変更・アーカイブ・削除 */
export function CardMenu({
  x,
  y,
  run,
  onOpenPanel,
  onClose,
  onError,
}: {
  x: number;
  y: number;
  run: Run;
  onOpenPanel: (run: Run) => void;
  onClose: () => void;
  onError: (m: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      onClose();
    }
  };

  // 画面の端からはみ出さないように寄せる
  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - 220);

  // サイドバーの横スライド（transform）の中からも開くので、body の直下に出す
  return createPortal(
    <div ref={ref} className="menu" style={{ left, top }} role="menu">
      <button role="menuitem" onClick={() => (onOpenPanel(run), onClose())}>
        <PanelRight size={14} /> 開く
      </button>
      <button
        role="menuitem"
        onClick={async () => {
          onClose();
          const title = await promptDialog({ title: "チャットの名前を変更", initial: run.title, confirmLabel: "変更" });
          if (title && title !== run.title) void act(() => api.renameRun(run.id, title));
        }}
      >
        <Pencil size={14} /> 名前を変更
      </button>
      {run.archived_at ? (
        <button role="menuitem" onClick={() => void act(() => api.archiveRun(run.id, false))}>
          <ArchiveRestore size={14} /> アーカイブから戻す
        </button>
      ) : (
        <button role="menuitem" onClick={() => void act(() => api.archiveRun(run.id))}>
          <Archive size={14} /> アーカイブ
        </button>
      )}
      <button
        role="menuitem"
        className="danger"
        onClick={async () => {
          onClose();
          const ok = await confirmDialog({
            title: `チャット「${run.title || "無題のチャット"}」を削除しますか？`,
            message: "会話の記録も消えます。残しておきたいときはアーカイブを使ってください。",
            confirmLabel: "削除",
            danger: true,
          });
          if (ok) void act(() => api.deleteRun(run.id));
        }}
      >
        <Trash2 size={14} /> 削除…
      </button>
    </div>,
    document.body,
  );
}
