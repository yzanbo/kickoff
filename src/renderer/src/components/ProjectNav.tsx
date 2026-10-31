import { useEffect, useState } from "react";
import { PHASE_LABELS, PHASES, type Approval, type Phase, type ProjectSummary, type Run } from "../../../core/types";
import { api } from "../api";
import { useServerEvent } from "../events";
import { href, navigate, routeProjectId, type Route } from "../router";

const EXPANDED_KEY = "kickoff:expanded";

function loadExpanded(): string[] {
  try {
    return JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

const projectKey = (id: number) => `p:${id}`;
const sectionKey = (id: number, section: Phase) => `s:${id}:${section}`;

/**
 * サイドバーのツリー: プロジェクト → セクション（要件定義・スケジュール・実装・テスト・デプロイ）→ チャット
 */
export function ProjectNav({ projects, approvals, route }: { projects: ProjectSummary[]; approvals: Approval[]; route: Route }) {
  const [expanded, setExpanded] = useState<string[]>(loadExpanded);
  const [runs, setRuns] = useState<Record<number, Run[]>>({});
  const activeProject = routeProjectId(route);
  const activeSection = route.name === "section" ? route.section : undefined;
  const activeRunId = route.name === "run" ? route.runId : undefined;

  // 開いている画面のプロジェクトとセクションは自動で展開する
  useEffect(() => {
    if (activeProject === undefined) return;
    const keys = [projectKey(activeProject)];
    if (activeSection) keys.push(sectionKey(activeProject, activeSection));
    if (route.name === "run") {
      const run = runs[activeProject]?.find((r) => r.id === route.runId);
      if (run) keys.push(sectionKey(activeProject, run.phase));
    }
    setExpanded((prev) => (keys.every((k) => prev.includes(k)) ? prev : [...new Set([...prev, ...keys])]));
  }, [activeProject, activeSection, activeRunId, runs, route]);

  useEffect(() => {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify(expanded));
  }, [expanded]);

  // 展開されているプロジェクトのチャット一覧を読み込む
  const openProjects = projects.filter((p) => expanded.includes(projectKey(p.id)));
  useEffect(() => {
    for (const p of openProjects) {
      if (runs[p.id]) continue;
      void api.runs(p.id).then((list) => setRuns((prev) => ({ ...prev, [p.id]: list })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openProjects.map((p) => p.id).join(",")]);

  // チャットの作成・状態の変化を反映する
  useServerEvent((e) => {
    if (e.type !== "run") return;
    setRuns((prev) => {
      const list = prev[e.run.project_id];
      if (!list) return prev;
      const exists = list.some((r) => r.id === e.run.id);
      return { ...prev, [e.run.project_id]: exists ? list.map((r) => (r.id === e.run.id ? e.run : r)) : [e.run, ...list] };
    });
  });

  const toggle = (key: string) => setExpanded((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  return (
    <ul className="tree">
      {projects.map((p) => {
        const open = expanded.includes(projectKey(p.id));
        const waiting = approvals.some((a) => a.project_id === p.id);
        return (
          <li key={p.id}>
            <div className={`tree-row project-row ${route.name === "project" && route.id === p.id ? "active" : ""}`}>
              <button className="chevron" aria-label={open ? "閉じる" : "開く"} aria-expanded={open} onClick={() => toggle(projectKey(p.id))}>
                {open ? "▾" : "▸"}
              </button>
              <a className="tree-link" href={href({ name: "project", id: p.id })}>
                <span className="tree-label project-name">{p.name}</span>
                {waiting && <Attention />}
                {p.active_runs > 0 && <span className="pill">{p.active_runs}</span>}
              </a>
            </div>
            {open && (
              <ul className="tree-children">
                {PHASES.map((section) => (
                  <SectionNode
                    key={section}
                    projectId={p.id}
                    section={section}
                    runs={(runs[p.id] ?? []).filter((r) => r.phase === section)}
                    approvals={approvals}
                    open={expanded.includes(sectionKey(p.id, section))}
                    onToggle={() => toggle(sectionKey(p.id, section))}
                    route={route}
                  />
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SectionNode({
  projectId,
  section,
  runs,
  approvals,
  open,
  onToggle,
  route,
}: {
  projectId: number;
  section: Phase;
  runs: Run[];
  approvals: Approval[];
  open: boolean;
  onToggle: () => void;
  route: Route;
}) {
  const selected = route.name === "section" && route.projectId === projectId && route.section === section;
  const waiting = runs.some((r) => approvals.some((a) => a.run_id === r.id));
  const working = runs.filter((r) => r.status === "running" || r.status === "queued").length;

  return (
    <li>
      <div className={`tree-row section-row ${selected ? "active" : ""}`}>
        <button className="chevron" aria-label={open ? "閉じる" : "開く"} aria-expanded={open} onClick={onToggle}>
          {open ? "▾" : "▸"}
        </button>
        <a className="tree-link" href={href({ name: "section", projectId, section })}>
          <span className="tree-label">{PHASE_LABELS[section]}</span>
          {!open && waiting && <Attention />}
          {!open && working > 0 && <span className="spinner small" aria-label="作業中" />}
        </a>
        <button
          className="icon-button tree-add"
          title={`${PHASE_LABELS[section]}の新しいチャット`}
          aria-label={`${PHASE_LABELS[section]}の新しいチャット`}
          onClick={() => navigate({ name: "section", projectId, section })}
        >
          ＋
        </button>
      </div>
      {open && (
        <ul className="tree-children">
          {runs.length === 0 && <li className="tree-empty">チャットはありません</li>}
          {runs.map((r) => {
            const active = route.name === "run" && route.runId === r.id;
            const isWaiting = approvals.some((a) => a.run_id === r.id);
            return (
              <li key={r.id}>
                <a className={`tree-row chat-row ${active ? "active" : ""}`} href={href({ name: "run", projectId, runId: r.id })}>
                  <span className="tree-label">{r.title || "チャット"}</span>
                  {isWaiting ? (
                    <Attention />
                  ) : r.status === "running" || r.status === "queued" ? (
                    <span className="spinner small" aria-label="作業中" />
                  ) : r.status === "failed" ? (
                    <span className="chat-failed" title="失敗" aria-label="失敗">
                      ✕
                    </span>
                  ) : null}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function Attention() {
  return (
    <span className="attention" title="回答待ちがあります" aria-label="回答待ちがあります">
      ●
    </span>
  );
}
