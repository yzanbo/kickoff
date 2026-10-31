import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { Approval, ProjectSummary, Run } from "../../../core/types";
import { api } from "../api";
import { useServerEvent } from "../events";
import { href, navigate, routeProjectId, type Route } from "../router";
import { SECTION_META } from "../sections";
import { RunStatusIcon } from "./RunStatus";

const CURRENT_KEY = "kickoff:current-project";
/** 横スワイプで隣へ移るのに必要な移動量（ページ幅に対する割合） */
const SWIPE_RATIO = 0.22;

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
  const [drag, setDrag] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ total: number; timer?: ReturnType<typeof setTimeout>; locked: boolean }>({ total: 0, locked: false });

  const index = Math.max(0, ordered.findIndex((p) => p.id === currentId));
  const current = ordered[index];

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

  /** スワイプの終わり: 十分動いていれば隣へ、そうでなければ元に戻す */
  const finish = (total: number) => {
    const width = trackRef.current?.clientWidth ?? 260;
    if (total > width * SWIPE_RATIO) go(index + 1);
    else if (total < -width * SWIPE_RATIO) go(index - 1);
    setDrag(0);
  };

  // トラックパッドの 2 本指スワイプ（横方向のホイール）
  function onWheel(e: WheelEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g.locked && Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // 縦スクロールはそのまま
    g.locked = true;
    g.total += e.deltaX;
    const width = trackRef.current?.clientWidth ?? 260;
    setDrag(Math.max(-width, Math.min(width, g.total)));
    clearTimeout(g.timer);
    g.timer = setTimeout(() => {
      finish(g.total);
      g.total = 0;
      g.locked = false;
    }, 140);
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
    if (p.horizontal) setDrag(dx);
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const p = pointer.current;
    if (!p || p.id !== e.pointerId) return;
    if (p.horizontal) finish(p.x - e.clientX);
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
        ref={trackRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          pointer.current = null;
          setDrag(0);
        }}
      >
        <div
          className={`workspace-track ${drag ? "dragging" : ""}`}
          style={{ transform: `translateX(calc(${-index * 100}% - ${drag}px))` }}
        >
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

function WorkspacePage({
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
  const waitingCount = approvals.filter((a) => a.project_id === project.id).length;
  const isActive = route.name === "project" && route.id === project.id;
  return (
    <section className="workspace-page" aria-hidden={hidden} inert={hidden}>
      <div className={`workspace-head ${isActive ? "active" : ""}`}>
        <a className="workspace-name" href={href({ name: "project", id: project.id, tab: "chats" })} title={project.repo_path}>
          {project.name}
        </a>
        {waitingCount > 0 && (
          <span className="count-badge" title="回答待ちのチャット" aria-label={`回答待ち ${waitingCount} 件`}>
            {waitingCount}
          </span>
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
      <ul className="nav-chats">
        {runs.length === 0 && (
          <li>
            <a className="nav-chat empty-chat" href={href({ name: "newChat", projectId: project.id })}>
              ＋ 最初のチャットを始める
            </a>
          </li>
        )}
        {runs.map((r) => {
          const Icon = SECTION_META[r.phase].icon;
          const waiting = approvals.some((a) => a.run_id === r.id);
          const active = route.name === "run" && route.runId === r.id;
          return (
            <li key={r.id}>
              <a
                className={`nav-chat ${active ? "active" : ""} ${waiting ? "is-waiting" : ""}`}
                href={href({ name: "run", projectId: project.id, runId: r.id })}
                title={`${SECTION_META[r.phase].label}: ${r.title}`}
              >
                <Icon className={`sec-icon sec-${r.phase}`} size={13} aria-label={SECTION_META[r.phase].label} />
                <span className="nav-chat-title">{r.title || "チャット"}</span>
                {(waiting || r.status !== "completed") && <RunStatusIcon run={r} waiting={waiting} />}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
