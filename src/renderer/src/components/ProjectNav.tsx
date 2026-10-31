import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import type { Approval, ProjectSummary, Run } from "../../../core/types";
import { api } from "../api";
import { useServerEvent } from "../events";
import { href, navigate, routeProjectId, type Route } from "../router";
import { SECTION_META } from "../sections";
import { RunStatusIcon } from "./RunStatus";

const EXPANDED_KEY = "kickoff:expanded-projects";
/** サイドバーに並べるチャットの数（それ以上はプロジェクト画面で） */
const VISIBLE_CHATS = 8;

function loadExpanded(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];
  } catch {
    return [];
  }
}

/** サイドバー: プロジェクト → チャット（新しい順）。チャットにはセクションのアイコンと色が付く */
export function ProjectNav({ projects, approvals, route }: { projects: ProjectSummary[]; approvals: Approval[]; route: Route }) {
  const [expanded, setExpanded] = useState<number[]>(loadExpanded);
  const [runs, setRuns] = useState<Record<number, Run[]>>({});
  const activeProject = routeProjectId(route);

  // 開いている画面のプロジェクトは自動で展開する
  useEffect(() => {
    if (activeProject !== undefined && !expanded.includes(activeProject)) setExpanded((prev) => [...prev, activeProject]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject]);

  useEffect(() => {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify(expanded));
  }, [expanded]);

  const openIds = projects.filter((p) => expanded.includes(p.id)).map((p) => p.id);
  useEffect(() => {
    for (const id of openIds) {
      if (runs[id]) continue;
      void api.runs(id).then((list) => setRuns((prev) => ({ ...prev, [id]: list })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openIds.join(",")]);

  // チャットの作成・更新を反映し、更新順に並べ直す
  useServerEvent((e) => {
    if (e.type !== "run") return;
    setRuns((prev) => {
      const list = prev[e.run.project_id];
      if (!list) return prev;
      const next = [e.run, ...list.filter((r) => r.id !== e.run.id)].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      return { ...prev, [e.run.project_id]: next };
    });
  });

  const toggle = (id: number) => setExpanded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <ul className="nav-projects">
      {projects.map((p) => {
        const open = expanded.includes(p.id);
        const projectRuns = runs[p.id] ?? [];
        const waitingCount = approvals.filter((a) => a.project_id === p.id).length;
        const isActive = route.name === "project" && route.id === p.id;
        return (
          <li key={p.id}>
            <div className={`nav-project ${isActive ? "active" : ""}`}>
              <button className="nav-chevron" aria-label={open ? "閉じる" : "開く"} aria-expanded={open} onClick={() => toggle(p.id)}>
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <a className="nav-project-link" href={href({ name: "project", id: p.id, tab: "chats" })}>
                <span className="nav-project-name">{p.name}</span>
                {waitingCount > 0 && (
                  <span className="count-badge" title="回答待ちのチャット" aria-label={`回答待ち ${waitingCount} 件`}>
                    {waitingCount}
                  </span>
                )}
              </a>
              <button
                className="nav-add"
                title="新しいチャット（⌘N）"
                aria-label={`${p.name} の新しいチャット`}
                onClick={() => navigate({ name: "newChat", projectId: p.id })}
              >
                <Plus size={14} />
              </button>
            </div>
            {open && (
              <ul className="nav-chats">
                {projectRuns.length === 0 && (
                  <li>
                    <a className="nav-chat empty-chat" href={href({ name: "newChat", projectId: p.id })}>
                      ＋ 最初のチャットを始める
                    </a>
                  </li>
                )}
                {projectRuns.slice(0, VISIBLE_CHATS).map((r) => {
                  const Icon = SECTION_META[r.phase].icon;
                  const waiting = approvals.some((a) => a.run_id === r.id);
                  const active = route.name === "run" && route.runId === r.id;
                  return (
                    <li key={r.id}>
                      <a
                        className={`nav-chat ${active ? "active" : ""} ${waiting ? "is-waiting" : ""}`}
                        href={href({ name: "run", projectId: p.id, runId: r.id })}
                        title={`${SECTION_META[r.phase].label}: ${r.title}`}
                      >
                        <Icon className={`sec-icon sec-${r.phase}`} size={13} aria-label={SECTION_META[r.phase].label} />
                        <span className="nav-chat-title">{r.title || "チャット"}</span>
                        {(waiting || r.status !== "completed") && <RunStatusIcon run={r} waiting={waiting} />}
                      </a>
                    </li>
                  );
                })}
                {projectRuns.length > VISIBLE_CHATS && (
                  <li>
                    <a className="nav-more" href={href({ name: "project", id: p.id, tab: "chats" })}>
                      すべて表示（{projectRuns.length}）
                    </a>
                  </li>
                )}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
