import { ChevronDown, ChevronRight, CircleAlert, CircleCheck, CircleDot, CircleX, Clock, ListTree, Plus, Search, X } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { Approval, ProjectSummary, Run, SearchHit } from "../../../core/types";
import { api } from "../api";
import { useServerEvent } from "../events";
import { href, navigate, routeProjectId, type Route } from "../router";
import { SECTION_META } from "../sections";
import { agentStateOf } from "../../../core/board";
import { AGENT_STATE_LABELS, AGENT_STATES, type AgentState } from "../../../core/types";
import { relativeTime } from "./RunList";
import { StatusSlot } from "./StatusSlot";

const CURRENT_KEY = "kickoff:current-project";
/** 横スワイプで隣へ移るのに必要な移動量（ページ幅に対する割合） */
const SWIPE_RATIO = 0.18;
/** この時間ホイールのイベントが途切れたら、1 回のジェスチャー（慣性を含む）が終わったとみなす */
const GESTURE_END_MS = 180;

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
  const ordered = [...projects].sort((a, b) => a.id - b.id);
  const [currentId, setCurrentId] = useState<number | undefined>(() => Number(localStorage.getItem(CURRENT_KEY)) || undefined);
  const [runs, setRuns] = useState<Record<number, Run[]>>({});
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  // 1 回のスワイプの状態。committed: すでに切り替えた（残りの慣性のイベントは無視する）
  const gesture = useRef<{
    total: number;
    timer?: ReturnType<typeof setTimeout>;
    active: boolean;
    committed: boolean;
    committedAt: number;
    /** 直前のイベントの移動量（慣性は小さくなっていくので、急に大きくなれば新しいスワイプ） */
    lastAbs: number;
  }>({ total: 0, active: false, committed: false, committedAt: 0, lastAbs: 0 });

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

  // すべてのプロジェクトのチャットを読み込む（スライドしたときにすぐ見えるように）
  const ids = ordered.map((p) => p.id).join(",");
  useEffect(() => {
    for (const p of ordered) {
      if (runs[p.id]) continue;
      void api.runs(p.id).then((list) => setRuns((prev) => ({ ...prev, [p.id]: list })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  useServerEvent((e) => {
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
    return atStart || atEnd ? offset / 4 : offset;
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
    const abs = Math.abs(e.deltaX);
    if (g.committed) {
      // 切り替えたあとに届く慣性のイベントは無視する（遅れて二重に動かないように）。
      // ただし移動量が急に大きくなったら、続けて行った次のスワイプとして受け付ける
      const isNewSwipe = performance.now() - g.committedAt > 100 && abs > Math.max(6, g.lastAbs * 1.6);
      g.lastAbs = abs;
      if (!isNewSwipe) return;
      g.committed = false;
      g.total = 0;
    }
    g.lastAbs = abs;
    g.total += e.deltaX;
    if (commitIfFar(g.total)) {
      g.committed = true;
      g.committedAt = performance.now();
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
              className={`workspace-dot ${i === index ? "active" : ""}`}
              style={{ "--ws-hue": `${(p.id * 67) % 360}` } as React.CSSProperties}
              title={`${p.name}${i < 9 ? `（⌃${i + 1}）` : ""}`}
              onClick={() => go(i)}
            >
              {initialOf(p.name)}
              {waiting && <span className="workspace-dot-badge" aria-label="回答待ちあり" />}
            </button>
          );
        })}
        <button className="workspace-dot add" title="新しいプロジェクト" aria-label="新しいプロジェクト" onClick={onNewProject}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

/** プロジェクト名の頭文字（アイコン用） */
function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "?";
}

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

/** 検索で一致した部分を強調して表示する */
function Highlight({ hit }: { hit: SearchHit }) {
  return (
    <>
      {hit.snippet.slice(0, hit.match_start)}
      <mark>{hit.snippet.slice(hit.match_start, hit.match_end)}</mark>
      {hit.snippet.slice(hit.match_end)}
    </>
  );
}

// プロジェクトを切り替えても、中身の変わらないページは描き直さない
const WorkspacePage = memo(function WorkspacePage({
  project,
  runs,
  approvals,
  route,
  hidden,
}: {
  project: ProjectSummary;
  runs: Run[];
  approvals: Approval[];
  route: Route;
  hidden: boolean;
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
  const [contentHits, setContentHits] = useState<Map<number, SearchHit>>(new Map());
  const keyword = query.trim();
  useEffect(() => {
    if (!keyword) {
      setContentHits(new Map());
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      api
        .search(keyword, { projectId: project.id })
        .then((hits) => {
          if (!alive) return;
          const map = new Map<number, SearchHit>();
          for (const h of hits) if (!map.has(h.run_id)) map.set(h.run_id, h);
          setContentHits(map);
        })
        .catch(() => {});
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [keyword, project.id]);

  const allRows = runs.map((run) => ({ run, state: agentStateOf(run, approvals.some((a) => a.run_id === run.id)) }));
  const titleMatches = (run: Run) => run.title.toLowerCase().includes(keyword.toLowerCase());
  const rows = keyword ? allRows.filter(({ run }) => titleMatches(run) || contentHits.has(run.id)) : allRows;

  const toggleGrouping = () => {
    const next = grouping === "recent" ? "status" : "recent";
    localStorage.setItem(GROUPING_KEY, next);
    setGrouping(next);
  };

  const renderRow = ({ run, state }: { run: Run; state: AgentState }) => {
    const meta = SECTION_META[run.phase];
    const Icon = meta.icon;
    const active = route.name === "run" && route.runId === run.id;
    return (
      <li key={run.id}>
        <a
          className={`chat-row ${active ? "active" : ""} ${state === "needs_input" || state === "attention" ? "is-unread" : ""}`}
          href={href({ name: "run", projectId: project.id, runId: run.id })}
          title={`${meta.label}: ${run.title}（${AGENT_STATE_LABELS[state]}）`}
        >
          <StatusSlot state={state} />
          <span className="chat-row-body">
            <span className="chat-row-line">
              <span className="chat-row-title">{run.title || "チャット"}</span>
              <span className="chat-row-time">{relativeTime(run.updated_at)}</span>
            </span>
            {keyword && !titleMatches(run) && contentHits.has(run.id) ? (
              // 中身だけが一致したときは、一致した部分を見せる
              <span className="chat-row-snippet">
                <Highlight hit={contentHits.get(run.id)!} />
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
    <section className="workspace-page" aria-hidden={hidden} inert={hidden}>
      <div className={`workspace-head ${isActive ? "active" : ""}`}>
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
        <a className="workspace-name" href={href({ name: "project", id: project.id, tab: "board" })} title={`${project.name} のカンバンを開く`}>
          {project.name}
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
        <button
          className="icon-button"
          title="新しいチャット（⌘N）"
          aria-label={`${project.name} の新しいチャット`}
          onClick={() => navigate({ name: "newChat", projectId: project.id })}
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
      {collapsed || (keyword && rows.length === 0) ? null : rows.length === 0 ? (
        <a className="chat-row ghost" href={href({ name: "newChat", projectId: project.id })}>
          <Plus size={13} /> 最初のチャットを始める
        </a>
      ) : grouping === "recent" ? (
        <ul className="chat-rows">{rows.map(renderRow)}</ul>
      ) : (
        AGENT_STATES.map((state) => {
          const group = rows.filter((r) => r.state === state);
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
