import { useCallback, useEffect, useState } from "react";
import { PHASE_LABELS, type BusEvent, type ProjectSummary } from "../../core/types";
import { api, useServerEvents } from "./api";
import { NewProjectDialog } from "./components/NewProjectDialog";
import { UsageMeter } from "./components/UsageMeter";
import { HomePage } from "./pages/HomePage";
import { ProjectPage } from "./pages/ProjectPage";
import { SettingsPage } from "./pages/SettingsPage";
import { href, navigate, useRoute } from "./router";
import { FIVE_HOUR_IDLE, usePlanUsage } from "./usage";

export function App() {
  const route = useRoute();
  const planUsage = usePlanUsage();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsVersion, setProjectsVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [projectsDir, setProjectsDir] = useState("~/Documents");

  const loadProjects = useCallback(() => {
    api.projects().then(setProjects).catch(() => {});
  }, []);

  useEffect(() => {
    loadProjects();
    api.settings().then((s) => setProjectsDir(s.projectsDir)).catch(() => {});
  }, [loadProjects]);

  const connection = useServerEvents((event: BusEvent) => {
    planUsage.onEvent(event);
    switch (event.type) {
      case "project":
      case "project_deleted":
      case "task":
      case "task_deleted":
      case "run":
        loadProjects();
        setProjectsVersion((v) => v + 1);
        break;
      case "settings":
        setProjectsDir(event.settings.projectsDir);
        break;
    }
  });
  const { usage } = planUsage;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <a className="brand" href={href({ name: "home" })}>
            Kickoff
          </a>
        </div>
        <nav className="sidebar-section">
          <div className="sidebar-label-row">
            <span className="sidebar-label">プロジェクト</span>
            <button className="icon-button" title="新しいプロジェクト" aria-label="新しいプロジェクト" onClick={() => setCreating(true)}>
              ＋
            </button>
          </div>
          {projects.length === 0 ? (
            <button className="sidebar-new" onClick={() => setCreating(true)}>
              ＋ 新しいプロジェクト
            </button>
          ) : (
            <ul className="project-list">
              {projects.map((p) => (
                <li key={p.id}>
                  <a
                    className={`project-item ${route.name === "project" && route.id === p.id ? "active" : ""}`}
                    href={href({ name: "project", id: p.id })}
                  >
                    <span className="project-name">{p.name}</span>
                    <span className="project-meta">
                      {PHASE_LABELS[p.current_phase]}
                      {p.active_runs > 0 && <span className="pill">実行中 {p.active_runs}</span>}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </nav>
        {usage?.available && (
          <a className="sidebar-usage" href={href({ name: "home" })} title="使用状況の詳細">
            <UsageMeter window={usage.five_hour} compact idleText={FIVE_HOUR_IDLE} />
            <UsageMeter window={usage.seven_day} compact />
          </a>
        )}
        <div className="sidebar-footer">
          <a className={`nav-item ${route.name === "settings" ? "active" : ""}`} href={href({ name: "settings" })}>
            設定
          </a>
          <span className={`conn conn-${connection}`} title={CONNECTION_LABELS[connection]}>
            {CONNECTION_LABELS[connection]}
          </span>
        </div>
      </aside>
      <main className="main">
        {route.name === "settings" ? (
          <SettingsPage />
        ) : route.name === "project" ? (
          <ProjectPage id={route.id} version={projectsVersion} />
        ) : (
          <HomePage planUsage={planUsage} projects={projects} onNewProject={() => setCreating(true)} />
        )}
      </main>
      {creating && (
        <NewProjectDialog
          defaultParentDir={projectsDir}
          onClose={() => setCreating(false)}
          onCreated={(project) => {
            setCreating(false);
            loadProjects();
            navigate({ name: "project", id: project.id });
          }}
        />
      )}
    </div>
  );
}

const CONNECTION_LABELS = { connecting: "接続中…", open: "接続済み", closed: "切断" } as const;
