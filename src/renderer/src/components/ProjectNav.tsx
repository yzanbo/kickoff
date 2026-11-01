import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDot,
  CircleX,
  Clock,
  Folder,
  FolderPlus,
  GalleryHorizontal,
  ListTree,
  Pencil,
  Plus,
  Rows3,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { Approval, ProjectSummary, Run, RunGroup } from "../../../core/types";
import { api } from "../api";
import { Highlight, useChatSearch } from "../chatSearch";
import { droppedRunId, isRunDrag, PROJECT_DRAG_TYPE, startRunDrag, useGroupReorder, useReorder } from "../groups";
import { initialOf, projectHue } from "../projectColor";
import { InlineName } from "./InlineName";
import { useServerEvent } from "../events";
import { href, navigate, openNewChat, openRun, routeProjectId, type Route } from "../router";
import { SECTION_META } from "../sections";
import { agentStateOf } from "../../../core/board";
import { AGENT_STATE_LABELS, AGENT_STATES, type AgentState } from "../../../core/types";
import { relativeTime } from "./RunList";
import { StatusSlot } from "./StatusSlot";

const CURRENT_KEY = "kickoff:current-project";
const LAYOUT_KEY = "kickoff:sidebar-layout";
/** slide: 1 プロジェクトずつ横にスライド / stack: すべてのプロジェクトを縦に並べる */
type NavLayout = "slide" | "stack";
/** 横スワイプで隣へ移るのに必要な移動量（ページ幅に対する割合） */
const SWIPE_RATIO = 0.18;
/** この時間ホイールのイベントが途切れたら、1 回のジェスチャー（慣性を含む）が終わったとみなす */
const GESTURE_END_MS = 180;
/** 端のプロジェクトより先へ引っ張れる最大量（px） */
const EDGE_PULL_MAX = 36;

interface Props {
  projects: ProjectSummary[];
  approvals: Approval[];
  route: Route;
  onNewProject: () => void;
}

/**
 * Zen Browser のワークスペースのような、プロジェクトごとのサイドバー。
 * 1 ページ = 1 プロジェクトのチャット一覧で、横スワイプ・下部のアイコン・ショートカットで切り替える。
 */
export function ProjectNav({ projects, approvals, route, onNewProject }: Props) {
  // スライドの位置が変わらないよう、作成順に並べる
  // サイドバーでの並び順（ドラッグで並べ替えた順。同じなら作成順）
  const ordered = [...projects].sort((a, b) => a.position - b.position || a.id - b.id);
  const reorder = useReorder(
    ordered.map((p) => p.id),
    (ids) => void api.reorderProjects(ids),
    PROJECT_DRAG_TYPE,
  );
  /** 並べ替えのドロップ先にする（プロジェクトのアイコン・縦並びの各プロジェクト） */
  const reorderDrop = (id: number) => ({
    onDragOver: (e: React.DragEvent) => void reorder.over(e, id),
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) reorder.leave(id);
    },
    onDrop: (e: React.DragEvent) => void reorder.drop(e, id),
  });
  const [currentId, setCurrentId] = useState<number | undefined>(() => Number(localStorage.getItem(CURRENT_KEY)) || undefined);
  const [runs, setRuns] = useState<Record<number, Run[]>>({});
  const [layout, setLayout] = useState<NavLayout>(() => (localStorage.getItem(LAYOUT_KEY) === "stack" ? "stack" : "slide"));
  const changeLayout = (next: NavLayout) => {
    localStorage.setItem(LAYOUT_KEY, next);
    setLayout(next);
  };
  const [groups, setGroups] = useState<Record<number, RunGroup[]>>({});
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  // 1 回のスワイプの状態。committed: すでに切り替えた（残りの慣性のイベントは無視する）
  const gesture = useRef<{
    total: number;
    timer?: ReturnType<typeof setTimeout>;
    active: boolean;
    committed: boolean;
    committedAt: number;
    /** 切り替えたあとの慣性で見た、いちばん小さい移動量（慣性は小さくなっていく） */
    floor: number;
    /** floor よりはっきり大きい移動量が続いた回数（続けば、新しいスワイプ） */
    rising: number;
  }>({ total: 0, active: false, committed: false, committedAt: 0, floor: Infinity, rising: 0 });

  const index = Math.max(0, ordered.findIndex((p) => p.id === currentId));
  const current = ordered[index];

  /**
   * スライド位置を要素に直接反映する（指に追従させる間は React の再描画を挟まない）。
   * offset は指で動かしている量（px）。0 ならアニメーションで index の位置へ戻る。
   */
  const place = useCallback(
    (offset: number) => {
      const track = trackRef.current;
      if (!track) return;
      track.classList.toggle("dragging", offset !== 0);
      track.style.transform = `translateX(calc(${-index * 100}% - ${offset}px))`;
    },
    [index],
  );

  useLayoutEffect(() => place(0), [place]);

  // 開いた画面のプロジェクトにサイドバーも合わせる
  const routeProject = routeProjectId(route);
  useEffect(() => {
    if (routeProject !== undefined) setCurrentId(routeProject);
  }, [routeProject]);

  useEffect(() => {
    if (current) localStorage.setItem(CURRENT_KEY, String(current.id));
  }, [current]);

  // 縦並びでは、選んだプロジェクト（ショートカット・開いた画面）が見えるところまでスクロールする
  useEffect(() => {
    if (layout !== "stack" || !current) return;
    document.querySelector(`.workspace-stack [data-project-id="${current.id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [layout, current]);

  // すべてのプロジェクトのチャットを読み込む（スライドしたときにすぐ見えるように）
  const ids = ordered.map((p) => p.id).join(",");
  useEffect(() => {
    for (const p of ordered) {
      if (runs[p.id]) continue;
      void api.runs(p.id).then((list) => setRuns((prev) => ({ ...prev, [p.id]: list })));
      void api.groups(p.id).then((list) => setGroups((prev) => ({ ...prev, [p.id]: list })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  useServerEvent((e) => {
    if (e.type === "group") {
      setGroups((prev) => {
        const list = [e.group, ...(prev[e.group.project_id] ?? []).filter((g) => g.id !== e.group.id)];
        return { ...prev, [e.group.project_id]: list.sort((a, b) => a.position - b.position || a.id - b.id) };
      });
      return;
    }
    if (e.type === "group_deleted") {
      setGroups((prev) => ({ ...prev, [e.project_id]: (prev[e.project_id] ?? []).filter((g) => g.id !== e.id) }));
      return;
    }
    if (e.type === "run_deleted") {
      setRuns((prev) => ({ ...prev, [e.project_id]: (prev[e.project_id] ?? []).filter((r) => r.id !== e.id) }));
      return;
    }
    if (e.type !== "run") return;
    setRuns((prev) => {
      const list = prev[e.run.project_id] ?? [];
      const next = [e.run, ...list.filter((r) => r.id !== e.run.id)].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      return { ...prev, [e.run.project_id]: next };
    });
  });

  const go = useCallback(
    (to: number) => {
      const target = ordered[Math.min(Math.max(to, 0), ordered.length - 1)];
      if (target) setCurrentId(target.id);
    },
    [ordered],
  );

  // ショートカット: ⌥⌘← / ⌥⌘→ で前後、⌃1〜9 で n 番目
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        go(index + (e.key === "ArrowRight" ? 1 : -1));
      } else if (e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        go(Number(e.key) - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  const width = () => viewportRef.current?.clientWidth ?? 260;
  /** 端のプロジェクトより先へは、少しだけ動いて戻る（ゴムのような抵抗） */
  const resist = (offset: number) => {
    const atStart = index === 0 && offset < 0;
    const atEnd = index === ordered.length - 1 && offset > 0;
    if (!atStart && !atEnd) return offset;
    return Math.sign(offset) * Math.min(EDGE_PULL_MAX, Math.abs(offset) / 4);
  };

  /** 移動量がしきい値を超えたら、その場で隣へ切り替える */
  const commitIfFar = (total: number): boolean => {
    const threshold = width() * SWIPE_RATIO;
    if (total > threshold && index < ordered.length - 1) {
      go(index + 1);
      return true;
    }
    if (total < -threshold && index > 0) {
      go(index - 1);
      return true;
    }
    return false;
  };

  // トラックパッドの 2 本指スワイプ（横方向のホイール）
  function onWheel(e: WheelEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g.active && Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // 縦スクロールはそのまま
    g.active = true;
    clearTimeout(g.timer);
    g.timer = setTimeout(() => {
      // ジェスチャーの終わり: 切り替えていなければ元の位置へ戻す
      if (!g.committed) place(0);
      g.total = 0;
      g.active = false;
      g.committed = false;
    }, GESTURE_END_MS);
    if (g.committed) {
      // 切り替えたあとに届く慣性のイベントは無視する（遅れて二重に動いたり、端で引っ張られたままにならないように）。
      // 慣性は揺らぎながら小さくなっていくので、1 回だけ大きいのは揺らぎとみなし、
      // 底からはっきり大きい移動量が続いたときだけ、続けて行った次のスワイプとして受け付ける
      const abs = Math.abs(e.deltaX);
      g.floor = Math.min(g.floor, abs);
      g.rising = abs > g.floor * 2 + 4 ? g.rising + 1 : 0;
      // その向きに隣のプロジェクトがなければ、次のスワイプでも動かさない（端で引っ張られたままになるのを防ぐ）
      const canMove = e.deltaX > 0 ? index < ordered.length - 1 : index > 0;
      if (performance.now() - g.committedAt < 120 || g.rising < 3 || !canMove) return;
      g.committed = false;
      g.total = 0;
    }
    g.total += e.deltaX;
    if (commitIfFar(g.total)) {
      g.committed = true;
      g.committedAt = performance.now();
      g.floor = Infinity;
      g.rising = 0;
      return;
    }
    place(resist(Math.max(-width(), Math.min(width(), g.total))));
  }

  // スマホなどのタッチ・ドラッグ
  const pointer = useRef<{ id: number; x: number; y: number; horizontal?: boolean } | null>(null);
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse") return;
    pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const p = pointer.current;
    if (!p || p.id !== e.pointerId) return;
    const dx = p.x - e.clientX;
    const dy = p.y - e.clientY;
    if (p.horizontal === undefined && Math.hypot(dx, dy) > 8) p.horizontal = Math.abs(dx) > Math.abs(dy);
    if (p.horizontal) place(resist(dx));
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const p = pointer.current;
    if (!p || p.id !== e.pointerId) return;
    if (p.horizontal && !commitIfFar(p.x - e.clientX)) place(0);
    pointer.current = null;
  }

  if (ordered.length === 0) {
    return (
      <div className="workspace-empty">
        <button className="sidebar-new" onClick={onNewProject}>
          <Plus size={14} /> 新しいプロジェクト
        </button>
      </div>
    );
  }

  /** 横スライド / 縦並びの切り替え（下の行の右端） */
  const layoutToggle = (
    <div className="sidebar-layout-toggle" role="group" aria-label="プロジェクトの並べ方">
      <button
        className={layout === "slide" ? "active" : ""}
        aria-pressed={layout === "slide"}
        title="1 プロジェクトずつ横にスライド"
        onClick={() => changeLayout("slide")}
      >
        <GalleryHorizontal size={13} />
      </button>
      <button
        className={layout === "stack" ? "active" : ""}
        aria-pressed={layout === "stack"}
        title="すべてのプロジェクトを縦に並べる"
        onClick={() => changeLayout("stack")}
      >
        <Rows3 size={13} />
      </button>
    </div>
  );

  if (layout === "stack") {
    return (
      <div className="workspaces">
        <div className="workspace-stack">
          {ordered.map((p) => (
            <div key={p.id} className={`stack-item ${reorder.classFor(p.id)}`} {...reorderDrop(p.id)}>
              <WorkspacePage
                project={p}
                runs={runs[p.id] ?? []}
                groups={groups[p.id] ?? NO_GROUPS}
                approvals={approvals}
                route={route}
                hidden={false}
                headDrag={reorder.handle(p.id)}
              />
            </div>
          ))}
        </div>
        <div className="workspace-switcher stack">
          <button className="sidebar-new" onClick={onNewProject}>
            <Plus size={14} /> 新しいプロジェクト
          </button>
          {layoutToggle}
        </div>
      </div>
    );
  }

  return (
    <div className="workspaces">
      <div
        className="workspace-viewport"
        ref={viewportRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          pointer.current = null;
          place(0);
        }}
      >
        <div className="workspace-track" ref={trackRef}>
          {ordered.map((p, i) => (
            <WorkspacePage
              key={p.id}
              project={p}
              runs={runs[p.id] ?? []}
              groups={groups[p.id] ?? NO_GROUPS}
              approvals={approvals}
              route={route}
              hidden={i !== index}
            />
          ))}
        </div>
      </div>

      <div className="workspace-switcher" role="tablist" aria-label="プロジェクトの切り替え">
        {ordered.map((p, i) => {
          const waiting = approvals.some((a) => a.project_id === p.id);
          return (
            <button
              key={p.id}
              role="tab"
              aria-selected={i === index}
              className={`workspace-dot ${i === index ? "active" : ""} ${reorder.classFor(p.id)}`}
              style={{ "--ws-hue": `${projectHue(p.id)}` } as React.CSSProperties}
              title={`${p.name}${i < 9 ? `（⌃${i + 1}）` : ""}（ドラッグで並べ替え）`}
              onClick={() => go(i)}
              draggable
              {...reorder.handle(p.id)}
              {...reorderDrop(p.id)}
            >
              {initialOf(p.name)}
              {waiting && <span className="workspace-dot-badge" aria-label="回答待ちあり" />}
            </button>
          );
        })}
        <button className="workspace-dot add" title="新しいプロジェクト" aria-label="新しいプロジェクト" onClick={onNewProject}>
          <Plus size={14} />
        </button>
        {layoutToggle}
      </div>
    </div>
  );
}


const NO_GROUPS: RunGroup[] = [];

type Grouping = "recent" | "status";
const GROUPING_KEY = "kickoff:sidebar-grouping";

/** ステータスでまとめるときの見出しのアイコン */
const GROUP_ICONS: Record<AgentState, typeof CircleAlert> = {
  needs_input: CircleAlert,
  failed: CircleX,
  attention: CircleCheck,
  running: CircleDot,
  done: CircleCheck,
};

// プロジェクトを切り替えても、中身の変わらないページは描き直さない
const WorkspacePage = memo(function WorkspacePage({
  project,
  runs,
  groups,
  approvals,
  route,
  hidden,
  headDrag,
}: {
  project: ProjectSummary;
  runs: Run[];
  groups: RunGroup[];
  approvals: Approval[];
  route: Route;
  hidden: boolean;
  /** 縦並びのとき: 見出しのカードをつかんでプロジェクトを並べ替える */
  headDrag?: { onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void };
}) {
  const [grouping, setGrouping] = useState<Grouping>(() => (localStorage.getItem(GROUPING_KEY) === "status" ? "status" : "recent"));
  // 見出しのクリックでチャット一覧を開閉する（プロジェクトごとに記憶）
  const collapseKey = `kickoff:collapsed:${project.id}`;
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(collapseKey) === "1");
  const toggleCollapsed = () => {
    localStorage.setItem(collapseKey, collapsed ? "0" : "1");
    setCollapsed(!collapsed);
  };
  const waitingCount = approvals.filter((a) => a.project_id === project.id).length;
  const isActive = route.name === "project" && route.id === project.id;
  // プロジェクト内の検索: チャット名と、やり取りの中身（サーバーで全文検索）の両方で絞り込む
  const [query, setQuery] = useState("");
  const { keyword, matches, snippetFor } = useChatSearch(query, project.id);

  const allRows = runs.map((run) => ({ run, state: agentStateOf(run, approvals.some((a) => a.run_id === run.id)) }));
  const rows = allRows.filter(({ run }) => matches(run));

  // 自分で作ったグループ
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<number>();
  /** ドラッグ中のチャットを重ねている先（グループの ID / "none" はグループなし） */
  const [dropOver, setDropOver] = useState<number | "none">();
  // グループの開閉（グループごとに記憶。グループはあとから読み込まれるので、その都度 localStorage を見る）
  const [closedOverride, setClosedOverride] = useState<Record<number, boolean>>({});
  const isGroupClosed = (id: number) => closedOverride[id] ?? localStorage.getItem(`kickoff:group-closed:${id}`) === "1";
  // 「グループなし」の開閉（プロジェクトごとに記憶。検索中は開いて見せる）
  const ungroupedKey = `kickoff:ungrouped-closed:${project.id}`;
  const [ungroupedClosed, setUngroupedClosed] = useState(() => localStorage.getItem(ungroupedKey) === "1");
  const toggleUngrouped = () => {
    localStorage.setItem(ungroupedKey, ungroupedClosed ? "0" : "1");
    setUngroupedClosed(!ungroupedClosed);
  };
  const toggleGroup = (id: number) => {
    const closed = !isGroupClosed(id);
    localStorage.setItem(`kickoff:group-closed:${id}`, closed ? "1" : "0");
    setClosedOverride((prev) => ({ ...prev, [id]: closed }));
  };
  const startCreate = () => {
    if (collapsed) toggleCollapsed();
    setCreating(true);
  };
  const removeGroup = async (group: RunGroup) => {
    if (!confirm(`グループ「${group.name}」を削除しますか？\n中のチャットは消えず、グループなしに戻ります。`)) return;
    await api.deleteGroup(group.id);
  };
  /**
   * ドロップできる場所にする。チャットはそのグループへ（groupId が null ならグループから外す）、
   * グループの見出しは、その位置へ並べ替える
   */
  const reorder = useGroupReorder(
    groups.map((g) => g.id),
    (ids) => void api.reorderGroups(project.id, ids),
  );
  const dropTarget = (groupId: number | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (reorder.over(e, groupId)) return;
      if (!isRunDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropOver(groupId ?? "none");
    },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setDropOver(undefined);
      reorder.leave(groupId);
    },
    onDrop: (e: React.DragEvent) => {
      setDropOver(undefined);
      if (reorder.drop(e, groupId)) return;
      const runId = droppedRunId(e);
      const run = runs.find((r) => r.id === runId);
      if (!run || run.group_id === groupId) return;
      e.preventDefault();
      void api.setRunGroup(run.id, groupId);
    },
  });
  const groupIds = new Set(groups.map((g) => g.id));
  const groupedRows = (id: number) => rows.filter(({ run }) => run.group_id === id);
  const ungroupedRows = rows.filter(({ run }) => run.group_id === null || !groupIds.has(run.group_id));

  const toggleGrouping = () => {
    const next = grouping === "recent" ? "status" : "recent";
    localStorage.setItem(GROUPING_KEY, next);
    setGrouping(next);
  };

  const renderRow = ({ run, state }: { run: Run; state: AgentState }) => {
    const meta = SECTION_META[run.phase];
    const Icon = meta.icon;
    const active = route.name === "run" && route.runId === run.id;
    const snippet = snippetFor(run);
    return (
      <li key={run.id}>
        <a
          className={`chat-row ${active ? "active" : ""} ${state === "needs_input" || state === "attention" ? "is-unread" : ""}`}
          href={href({ name: "run", projectId: project.id, runId: run.id })}
          title={`${meta.label}: ${run.title}（${AGENT_STATE_LABELS[state]}）`}
          draggable
          onDragStart={(e) => startRunDrag(e, run.id)}
          onClick={(e) => {
            // 開いているチャットをもう一度押したときも、閉じたパネルを開き直す
            e.preventDefault();
            openRun(project.id, run.id);
          }}
        >
          <StatusSlot state={state} />
          <span className="chat-row-body">
            <span className="chat-row-line">
              <span className="chat-row-title">{run.title || "チャット"}</span>
              <span className="chat-row-time">{relativeTime(run.updated_at)}</span>
            </span>
            {snippet ? (
              // 中身だけが一致したときは、一致した部分を見せる
              <span className="chat-row-snippet">
                <Highlight hit={snippet} />
              </span>
            ) : (
              <span className="chat-row-meta">
                <Icon size={11} className={`sec-icon sec-${run.phase}`} aria-hidden />
                {meta.label}
              </span>
            )}
          </span>
        </a>
      </li>
    );
  };

  return (
    <section
      className="workspace-page"
      data-project-id={project.id}
      aria-hidden={hidden}
      inert={hidden}
      style={{ "--ws-hue": `${projectHue(project.id)}` } as React.CSSProperties}
    >
      {/* どのプロジェクトを見ているかが一目でわかるよう、プロジェクトの色のカードにする */}
      <div
        className={`workspace-head ${isActive ? "active" : ""}`}
        draggable={Boolean(headDrag)}
        title={headDrag ? "ドラッグでプロジェクトを並べ替える" : undefined}
        {...headDrag}
      >
        {/* 左のボタン: チャット一覧の開閉 / 名前: プロジェクトのカンバンを表示 */}
        <button
          className="workspace-chevron"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "チャット一覧を開く" : "チャット一覧を閉じる"}
          title={collapsed ? "チャット一覧を開く" : "チャット一覧を閉じる"}
          onClick={toggleCollapsed}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <a className="workspace-title" href={href({ name: "project", id: project.id, tab: "board" })} title={`${project.name} のカンバンを開く`}>
          <span className="workspace-avatar" aria-hidden>
            {initialOf(project.name)}
          </span>
          <span className="workspace-title-text">
            <span className="workspace-name">{project.name}</span>
            <span className="workspace-sub">{runs.length} チャット</span>
          </span>
        </a>
        {waitingCount > 0 && (
          <span className="count-badge" title="回答待ちのチャット" aria-label={`回答待ち ${waitingCount} 件`}>
            {waitingCount}
          </span>
        )}
        {!collapsed && (
          <button
            className="icon-button"
            title={grouping === "recent" ? "ステータスでまとめる" : "新しい順に並べる"}
            aria-label={grouping === "recent" ? "ステータスでまとめる" : "新しい順に並べる"}
            onClick={toggleGrouping}
          >
            {grouping === "recent" ? <ListTree size={14} /> : <Clock size={14} />}
          </button>
        )}
        <button className="icon-button" title="グループを作成" aria-label={`${project.name} にグループを作成`} onClick={startCreate}>
          <FolderPlus size={14} />
        </button>
        <button
          className="icon-button"
          title="新しいチャット（⌘N）"
          aria-label={`${project.name} の新しいチャット`}
          onClick={() => openNewChat(project.id)}
        >
          <Plus size={15} />
        </button>
      </div>
      {!collapsed && allRows.length > 0 && (
        <div className="chat-search">
          <Search size={13} className="muted" aria-hidden />
          <input
            type="text"
            value={query}
            placeholder="このプロジェクトのチャットを検索"
            aria-label={`${project.name} のチャットを検索`}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          />
          {query && (
            <button className="chat-search-clear" aria-label="検索を解除" onClick={() => setQuery("")}>
              <X size={12} />
            </button>
          )}
        </div>
      )}
      {!collapsed && keyword && rows.length === 0 && <p className="chat-search-empty">「{keyword}」に一致するチャットはありません</p>}
      {!collapsed && creating && (
        <div className="custom-group-head editing">
          <Folder size={13} aria-hidden />
          <InlineName
            placeholder="グループ名（例: コードレビュー）"
            onSubmit={(name) => {
              setCreating(false);
              void api.createGroup(project.id, name);
            }}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}
      {!collapsed &&
        groups.map((group) => {
          const members = groupedRows(group.id);
          // 検索中は、一致するチャットがないグループを隠す
          if (keyword && members.length === 0) return null;
          const closed = isGroupClosed(group.id) && !keyword;
          return (
            <div
              key={group.id}
              className={`custom-group ${dropOver === group.id ? "drop-target" : ""} ${reorder.classFor(group.id)}`}
              {...dropTarget(group.id)}
            >
              <div
                className={`custom-group-head ${route.name === "project" && route.tab === "groups" && route.group === group.id ? "active" : ""}`}
                draggable={renaming !== group.id}
                title="ドラッグでグループを並べ替える"
                {...reorder.handle(group.id)}
              >
                <button
                  className="custom-group-toggle"
                  aria-expanded={!closed}
                  title={closed ? "開く" : "閉じる"}
                  onClick={() => toggleGroup(group.id)}
                >
                  {closed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  <Folder size={13} aria-hidden />
                </button>
                {renaming === group.id ? (
                  <InlineName
                    initial={group.name}
                    onSubmit={(name) => {
                      setRenaming(undefined);
                      void api.renameGroup(group.id, name);
                    }}
                    onCancel={() => setRenaming(undefined)}
                  />
                ) : (
                  <button
                    type="button"
                    className="custom-group-name"
                    title="プロジェクトのグループで表示（ダブルクリックで名前を変更）"
                    onClick={() => navigate({ name: "project", id: project.id, tab: "groups", group: group.id })}
                    onDoubleClick={() => setRenaming(group.id)}
                  >
                    {group.name}
                  </button>
                )}
                {/* 名前の編集中は、ほかの操作を隠す（鉛筆を押し直して編集が始まり直さないように） */}
                {renaming !== group.id && (
                  <>
                    <span className="custom-group-count">{members.length}</span>
                    <span className="custom-group-actions">
                      <button className="icon-button" title="名前を変更" aria-label={`${group.name} の名前を変更`} onClick={() => setRenaming(group.id)}>
                        <Pencil size={12} />
                      </button>
                      <button className="icon-button" title="グループを削除" aria-label={`${group.name} を削除`} onClick={() => void removeGroup(group)}>
                        <Trash2 size={12} />
                      </button>
                    </span>
                    <button
                      className="icon-button custom-group-add"
                      title={`「${group.name}」に新しいチャット`}
                      aria-label={`${group.name} に新しいチャット`}
                      onClick={() => openNewChat(project.id, { group: group.id })}
                    >
                      <Plus size={13} />
                    </button>
                  </>
                )}
              </div>
              {!closed &&
                (members.length === 0 ? (
                  <p className="custom-group-empty">チャットをここへドラッグ</p>
                ) : (
                  <ul className="chat-rows custom-group-rows">{members.map(renderRow)}</ul>
                ))}
            </div>
          );
        })}
      {!collapsed && groups.length > 0 && ungroupedRows.length > 0 && (
        <div className={`custom-group-head ungrouped ${dropOver === "none" ? "drop-target" : ""}`} {...dropTarget(null)}>
          <button
            className="custom-group-toggle"
            aria-expanded={!(ungroupedClosed && !keyword)}
            title={ungroupedClosed ? "開く" : "閉じる"}
            onClick={toggleUngrouped}
          >
            {ungroupedClosed && !keyword ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
          <button className="custom-group-name ungrouped-name" onClick={toggleUngrouped}>
            グループなし
          </button>
          <span className="custom-group-count">{ungroupedRows.length}</span>
        </div>
      )}
      {collapsed || (keyword && rows.length === 0) || (groups.length > 0 && ungroupedClosed && !keyword) ? null : rows.length === 0 ? (
        <button className="chat-row ghost" onClick={() => openNewChat(project.id)}>
          <Plus size={13} /> 最初のチャットを始める
        </button>
      ) : ungroupedRows.length === 0 ? null : grouping === "recent" ? (
        <ul className="chat-rows" {...(groups.length > 0 ? dropTarget(null) : {})}>
          {ungroupedRows.map(renderRow)}
        </ul>
      ) : (
        AGENT_STATES.map((state) => {
          const group = ungroupedRows.filter((r) => r.state === state);
          if (group.length === 0) return null;
          const Icon = GROUP_ICONS[state];
          return (
            <div key={state} className="status-group">
              <div className={`status-group-head state-${state}`}>
                <Icon size={14} />
                {AGENT_STATE_LABELS[state]}
              </div>
              <ul className="chat-rows">{group.map(renderRow)}</ul>
            </div>
          );
        })
      )}
    </section>
  );
});
