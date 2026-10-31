import { useEffect, useState } from "react";
import { PHASE_LABELS, PHASES, type Approval, type ProjectSummary } from "../../../core/types";
import { href, routeProjectId, type Route } from "../router";

const EXPANDED_KEY = "kickoff:expanded-projects";

function loadExpanded(): number[] {
  try {
    return JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "[]") as number[];
  } catch {
    return [];
  }
}

/** サイドバーのプロジェクト一覧（プロジェクトの下にフェーズを並べるアコーディオン） */
export function ProjectNav({ projects, approvals, route }: { projects: ProjectSummary[]; approvals: Approval[]; route: Route }) {
  const [expanded, setExpanded] = useState<number[]>(loadExpanded);
  const activeProject = routeProjectId(route);

  // 開いているプロジェクトは自動で展開する
  useEffect(() => {
    if (activeProject !== undefined && !expanded.includes(activeProject)) setExpanded((prev) => [...prev, activeProject]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject]);

  useEffect(() => {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify(expanded));
  }, [expanded]);

  const toggle = (id: number) => setExpanded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <ul className="project-list">
      {projects.map((p) => {
        const open = expanded.includes(p.id);
        const currentIndex = PHASES.indexOf(p.current_phase);
        const waiting = approvals.some((a) => a.project_id === p.id);
        return (
          <li key={p.id}>
            <div className={`project-item ${route.name === "project" && route.id === p.id ? "active" : ""}`}>
              <button
                className="chevron"
                aria-label={open ? "閉じる" : "開く"}
                aria-expanded={open}
                onClick={() => toggle(p.id)}
              >
                {open ? "▾" : "▸"}
              </button>
              <a className="project-link" href={href({ name: "project", id: p.id })}>
                <span className="project-name">
                  {p.name}
                  {waiting && (
                    <span className="attention" title="回答待ちがあります" aria-label="回答待ちがあります">
                      ●
                    </span>
                  )}
                </span>
                {p.active_runs > 0 && <span className="pill">実行中 {p.active_runs}</span>}
              </a>
            </div>
            {open && (
              <ul className="phase-list">
                {PHASES.map((phase, i) => {
                  const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
                  const counts = p.phase_task_counts?.[phase];
                  const selected =
                    route.name === "phase" && route.projectId === p.id && route.phase === phase;
                  return (
                    <li key={phase}>
                      <a className={`phase-item phase-${state} ${selected ? "active" : ""}`} href={href({ name: "phase", projectId: p.id, phase })}>
                        <span className="phase-icon" aria-hidden>
                          {state === "done" ? "✓" : state === "current" ? "●" : "○"}
                        </span>
                        <span className="phase-name">{PHASE_LABELS[phase]}</span>
                        {counts && counts.total > 0 && (
                          <span className="phase-count" title={`完了 ${counts.done} / 全 ${counts.total} タスク`}>
                            {counts.done}/{counts.total}
                          </span>
                        )}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
