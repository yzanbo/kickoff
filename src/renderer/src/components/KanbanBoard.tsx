import { Archive, ChevronLeft, ChevronRight, List, Maximize2, Pencil, PanelRight, Plus, SquareKanban, Trash2, X, Globe } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
} from "../../../core/types";
import { api } from "../api";
import { useServerEvent } from "../events";
import { navigate } from "../router";
import { SECTION_META } from "../sections";
import { RunPage } from "../pages/RunPage";
import { normalizeUrl } from "../url";
import { BrowserPane } from "./BrowserPane";
import { relativeTime } from "./RunList";
import { SectionBadge } from "./SectionBadge";

type ViewMode = "board" | "list";

/** 右側のパネルのタブ（チャット、またはブラウザ） */
type PanelTab =
  | { key: string; kind: "chat"; id: number; projectId: number }
  | { key: string; kind: "browser"; url: string; title: string };

const chatKey = (id: number) => `chat:${id}`;

function hostOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).host || url;
  } catch {
    return url;
  }
}

const PANEL_WIDTH_KEY = "kickoff:panel-width";
const DEFAULT_PANEL_WIDTH = 560;
const MIN_PANEL_WIDTH = 360;

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
}

/**
 * チャットのカンバン。列（未着手・対応中・レビュー・完了）はあなたが動かす進み具合で、
 * カードの点はエージェント自身の状態（回答待ち・作業中・確認待ちなど）。
 */
export function KanbanBoard({ projectId, projects, approvals, title }: Props) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<ViewMode>(() => (localStorage.getItem("kickoff:board-view") === "list" ? "list" : "board"));
  const [section, setSection] = useState<Phase | "all">("all");
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<BoardStage | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; run: Run } | null>(null);
  // 右側のパネルで開いているチャット（タブ）。パネルを閉じてもタブは残し、次に開いたときに戻す
  const [tabs, setTabs] = useState<PanelTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(() => Number(localStorage.getItem(PANEL_WIDTH_KEY)) || DEFAULT_PANEL_WIDTH);
  const [resizing, setResizing] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();
  const [, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    (projectId === undefined ? api.allRuns() : api.runs(projectId))
      .then((list) => alive && (setRuns(list), setLoaded(true)))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    // 経過時間の表示を進める
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [projectId]);

  useEffect(() => localStorage.setItem("kickoff:board-view", view), [view]);

  useServerEvent((e) => {
    if (e.type === "run" && (projectId === undefined || e.run.project_id === projectId)) {
      setRuns((prev) => {
        const rest = prev.filter((r) => r.id !== e.run.id);
        return e.run.archived_at ? rest : [e.run, ...rest];
      });
    } else if (e.type === "run_deleted") {
      setRuns((prev) => prev.filter((r) => r.id !== e.id));
    }
  });

  const projectName = (id: number) => projects.find((p) => p.id === id)?.name ?? "";
  const pendingFor = (run: Run) => approvals.filter((a) => a.run_id === run.id).length;

  const grouped = useMemo(() => {
    const map = new Map<BoardStage, { run: Run; state: AgentState }[]>(BOARD_STAGES.map((s) => [s, []]));
    for (const run of runs) {
      if (section !== "all" && run.phase !== section) continue;
      const state = agentStateOf(run, approvals.some((a) => a.run_id === run.id));
      map.get(stageOf(run, state))?.push({ run, state });
    }
    for (const list of map.values()) list.sort((a, b) => b.run.updated_at.localeCompare(a.run.updated_at));
    return map;
  }, [runs, approvals, section]);

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

  /** 列の＋: その列に置く新しいチャット（全体ボードでは、最近のプロジェクトで始める） */
  function newChat(stage: BoardStage) {
    const target = projectId ?? projects[0]?.id;
    if (target === undefined) return;
    navigate({ name: "newChat", projectId: target, stage, section: section === "all" ? undefined : section });
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

  /** カードをクリック: 右側のパネルにタブで開く（開いていればそのタブへ）。カンバンはその分狭くなる */
  const open = (run: Run) => {
    const key = chatKey(run.id);
    setTabs((prev) => (prev.some((t) => t.key === key) ? prev : [...prev, { key, kind: "chat", id: run.id, projectId: run.project_id }]));
    setActiveTab(key);
    setPanelOpen(true);
  };

  /** ブラウザのタブを開く（前回このボードで見ていた URL から） */
  const urlKey = `kickoff:browser-url:${projectId ?? "all"}`;
  const openBrowser = () => {
    const key = `browser:${Date.now()}`;
    const url = localStorage.getItem(urlKey) || "localhost:3000";
    setTabs((prev) => [...prev, { key, kind: "browser", url, title: "" }]);
    setActiveTab(key);
    setPanelOpen(true);
  };
  const closePanel = () => setPanelOpen(false);

  /** タブを閉じる。表示中のタブなら隣のタブへ、最後のタブならパネルも閉じる */
  const closeTab = (key: string) => {
    setTabs((prev) => {
      const index = prev.findIndex((t) => t.key === key);
      const next = prev.filter((t) => t.key !== key);
      if (activeTab === key) setActiveTab(next[Math.min(index, next.length - 1)]?.key ?? null);
      if (next.length === 0) setPanelOpen(false);
      return next;
    });
  };

  // 削除・アーカイブされたチャットのタブは閉じる
  useEffect(() => {
    const gone = tabs.filter((t) => t.kind === "chat" && !runs.some((r) => r.id === t.id));
    if (loaded && gone.length > 0) gone.forEach((t) => closeTab(t.key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, loaded]);

  /** パネルの左端をドラッグして幅を変える（カンバンを覆うところまで広げられる） */
  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const body = bodyRef.current;
    if (!body) return;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    setResizing(true);
    const right = body.getBoundingClientRect().right;
    const max = body.clientWidth;
    let width = panelWidth;
    const onMove = (ev: PointerEvent) => {
      width = Math.round(Math.max(MIN_PANEL_WIDTH, Math.min(max, right - ev.clientX)));
      body.style.setProperty("--panel-w", `${width}px`);
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      setResizing(false);
      setPanelWidth(width);
      localStorage.setItem(PANEL_WIDTH_KEY, String(width));
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  };

  // Esc でパネルを閉じる（メニューが開いていればメニューを優先）
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !menu && !document.querySelector("dialog[open]")) closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen, menu]);

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
        <select className="board-filter" aria-label="セクションで絞り込み" value={section} onChange={(e) => setSection(e.target.value as Phase | "all")}>
          <option value="all">すべてのセクション</option>
          {PHASES.map((p) => (
            <option key={p} value={p}>
              {SECTION_META[p].label}
            </option>
          ))}
        </select>
        <button className="btn btn-sm" onClick={openBrowser} title="開発中のアプリやドキュメントを右側で開く">
          <Globe size={13} /> ブラウザ
        </button>
        <button className="btn btn-sm" onClick={() => newChat("todo")} disabled={projectId === undefined && projects.length === 0}>
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
      </div>
      {error && <p className="error small board-error">{error}</p>}

      <div
        ref={bodyRef}
        className={`board-body ${panelOpen ? "with-panel" : ""} ${resizing ? "resizing" : ""}`}
        style={{ "--panel-w": `${panelWidth}px` } as React.CSSProperties}
      >
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
                  {list.length === 0 && <p className="column-empty">なし</p>}
                  {list.map(({ run, state }) => (
                    <article
                      key={run.id}
                      className={`board-card ${dragId === run.id ? "dragging" : ""} ${panelOpen && activeTab === chatKey(run.id) ? "selected" : ""} ${tabs.some((t) => t.key === chatKey(run.id)) ? "in-tab" : ""}`}
                      {...cardProps(run)}
                    >
                      <span className="card-title">{run.title || "無題のチャット"}</span>
                      <div className="card-labels">
                        {projectId === undefined && <span className="label-chip">{projectName(run.project_id)}</span>}
                        <SectionBadge section={run.phase} short />
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
                {list.length === 0 && <p className="column-empty">なし</p>}
                {list.map(({ run, state }) => (
                  <div
                    key={run.id}
                    className={`list-row ${dragId === run.id ? "dragging" : ""} ${panelOpen && activeTab === chatKey(run.id) ? "selected" : ""} ${tabs.some((t) => t.key === chatKey(run.id)) ? "in-tab" : ""}`}
                    {...cardProps(run)}
                  >
                    <div className="list-main">
                      <span className="card-title one-line">{run.title || "無題のチャット"}</span>
                      <span className="list-meta">
                        {projectId === undefined && <span className="label-chip">{projectName(run.project_id)}</span>}
                        <SectionBadge section={run.phase} short />
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
      <aside className="board-panel" aria-hidden={!panelOpen} inert={!panelOpen}>
        <div
          className="panel-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="パネルの幅を変える"
          title="ドラッグで幅を変える"
          onPointerDown={startResize}
        />
        <div className="panel-tabs" role="tablist">
          {tabs.map((t) => {
            const run = t.kind === "chat" ? runs.find((r) => r.id === t.id) : undefined;
            const Icon = t.kind === "browser" ? Globe : run ? SECTION_META[run.phase].icon : null;
            const label = t.kind === "browser" ? t.title || hostOf(t.url) : run?.title || "チャット";
            return (
              <div key={t.key} className={`panel-tab ${activeTab === t.key ? "active" : ""}`} role="tab" aria-selected={activeTab === t.key}>
                <button className="panel-tab-label" onClick={() => setActiveTab(t.key)} title={t.kind === "browser" ? t.url : run?.title}>
                  {Icon && <Icon size={12} className={run ? `sec-icon sec-${run.phase}` : "muted"} aria-hidden />}
                  <span>{label}</span>
                </button>
                <button className="panel-tab-close" aria-label={`${label} のタブを閉じる`} onClick={() => closeTab(t.key)}>
                  <X size={12} />
                </button>
              </div>
            );
          })}
          <button className="panel-tab-add" title="ブラウザのタブを開く" aria-label="ブラウザのタブを開く" onClick={openBrowser}>
            <Plus size={12} />
            <Globe size={12} />
          </button>
        </div>
        <div className="panel-content">
          {/* タブを切り替えても入力中の文章やスクロール位置が残るよう、開いているタブはすべて保持する */}
          {tabs.map((t) => (
            <div key={t.key} className="panel-tab-page" hidden={activeTab !== t.key}>
              {t.kind === "chat" ? (
                <RunPage projectId={t.projectId} runId={t.id} variant="panel" onClose={closePanel} />
              ) : (
                <BrowserPane
                  url={t.url}
                  onChange={({ url, title }) => {
                    localStorage.setItem(urlKey, url);
                    setTabs((prev) => prev.map((x) => (x.key === t.key && x.kind === "browser" ? { ...x, title } : x)));
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </aside>
      </div>

      {menu && <CardMenu {...menu} onOpenPanel={open} onClose={() => setMenu(null)} onError={setError} />}
    </div>
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
function CardMenu({
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
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  return (
    <div ref={ref} className="menu" style={{ left, top }} role="menu">
      <button role="menuitem" onClick={() => (onOpenPanel(run), onClose())}>
        <PanelRight size={14} /> 開く
      </button>
      <button role="menuitem" onClick={() => (navigate({ name: "run", projectId: run.project_id, runId: run.id }), onClose())}>
        <Maximize2 size={14} /> 全画面で開く
      </button>
      <button
        role="menuitem"
        onClick={() => {
          const title = prompt("チャットの名前", run.title)?.trim();
          if (title && title !== run.title) void act(() => api.renameRun(run.id, title));
          else onClose();
        }}
      >
        <Pencil size={14} /> 名前を変更
      </button>
      <button role="menuitem" onClick={() => void act(() => api.archiveRun(run.id))}>
        <Archive size={14} /> アーカイブ
      </button>
      {confirmDelete ? (
        <button role="menuitem" className="danger" onClick={() => void act(() => api.deleteRun(run.id))}>
          <Trash2 size={14} /> 本当に削除する
        </button>
      ) : (
        <button role="menuitem" className="danger" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={14} /> 削除…
        </button>
      )}
    </div>
  );
}
