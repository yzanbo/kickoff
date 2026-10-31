import { useCallback, useEffect, useState } from "react";
import type { Approval, BusEvent, ProjectSummary } from "../../core/types";
import { api, useServerEvents } from "./api";
import { NewProjectDialog } from "./components/NewProjectDialog";
import { ProjectNav } from "./components/ProjectNav";
import { publishServerEvent } from "./events";
import { UsageMeter } from "./components/UsageMeter";
import { HomePage } from "./pages/HomePage";
import { ProjectPage } from "./pages/ProjectPage";
import { NewChatPage } from "./pages/NewChatPage";
import { RunPage } from "./pages/RunPage";
import { SectionPage } from "./pages/SectionPage";
import { SettingsPage } from "./pages/SettingsPage";
import { href, navigate, useRoute } from "./router";
import { FIVE_HOUR_IDLE, usePlanUsage } from "./usage";

export function App() {
  const route = useRoute();
  const planUsage = usePlanUsage();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [creating, setCreating] = useState(false);
  const [projectsDir, setProjectsDir] = useState("~/Documents");

  const loadProjects = useCallback(() => {
    api.projects().then(setProjects).catch(() => {});
  }, []);

  useEffect(() => {
    loadProjects();
    api.settings().then((s) => setProjectsDir(s.projectsDir)).catch(() => {});
    api.approvals().then(setApprovals).catch(() => {});
  }, [loadProjects]);

  const connection = useServerEvents((event: BusEvent) => {
    planUsage.onEvent(event);
    publishServerEvent(event);
    switch (event.type) {
      case "project":
      case "project_deleted":
      case "task":
      case "task_deleted":
      case "run":
        loadProjects();
        break;
      case "approval":
        setApprovals((prev) => [...prev, event.approval]);
        break;
      case "approval_resolved":
        setApprovals((prev) => prev.filter((a) => a.id !== event.id));
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
            <ProjectNav projects={projects} approvals={approvals} route={route} />
          )}
        </nav>
        <div className="sidebar-footer">
          <a className={`nav-item ${route.name === "settings" ? "active" : ""}`} href={href({ name: "settings" })}>
            設定
          </a>
        </div>
      </aside>
      <main className="main">
        {route.name === "settings" ? (
          <SettingsPage />
        ) : route.name === "run" ? (
          <RunPage projectId={route.projectId} runId={route.runId} />
        ) : route.name === "newChat" ? (
          <NewChatPage projectId={route.projectId} section={route.section} />
        ) : route.name === "section" ? (
          <SectionPage projectId={route.projectId} section={route.section} />
        ) : route.name === "project" ? (
          <ProjectPage id={route.id} />
        ) : (
          <HomePage planUsage={planUsage} projects={projects} onNewProject={() => setCreating(true)} />
        )}
      </main>
      <footer className="app-footer">
        <span className={`conn conn-${connection}`} title="サーバーとの接続">
          {CONNECTION_LABELS[connection]}
        </span>
        <span className="spacer" />
        {usage?.available ? (
          <a className="footer-usage" href={href({ name: "home" })} title="使用状況の詳細">
            <UsageMeter window={usage.five_hour} inline idleText={FIVE_HOUR_IDLE} />
            <UsageMeter window={usage.seven_day} inline />
          </a>
        ) : (
          usage && <span className="muted">使用状況を取得できません</span>
        )}
      </footer>
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
