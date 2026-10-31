import { Plus, Search, Settings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Approval, BusEvent, ProjectSummary } from "../../core/types";
import { api, useServerEvents } from "./api";
import { CommandPalette } from "./components/CommandPalette";
import { NewProjectDialog } from "./components/NewProjectDialog";
import { ProjectNav } from "./components/ProjectNav";
import { SearchPanel } from "./components/SearchPanel";
import { UsageMeter } from "./components/UsageMeter";
import { publishServerEvent } from "./events";
import { HomePage } from "./pages/HomePage";
import { NewChatPage } from "./pages/NewChatPage";
import { ProjectPage } from "./pages/ProjectPage";
import { RunPage } from "./pages/RunPage";
import { SettingsPage } from "./pages/SettingsPage";
import { href, navigate, routeProjectId, useRoute } from "./router";
import { applyTheme, loadTheme } from "./theme";
import { FIVE_HOUR_IDLE, usePlanUsage } from "./usage";

applyTheme(loadTheme());

export function App() {
  const route = useRoute();
  const planUsage = usePlanUsage();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [creating, setCreating] = useState(false);
  const [palette, setPalette] = useState(false);
  const [searching, setSearching] = useState(false);
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

  // ショートカット: ⌘K 検索・移動 / ⌘F やり取りの検索 / ⌘N 今のプロジェクトで新しいチャット（プロジェクト外なら新しいプロジェクト）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      if (e.key === "k") {
        e.preventDefault();
        setPalette(true);
      } else if (e.key === "f") {
        e.preventDefault();
        setSearching(true);
      } else if (e.key === "n") {
        e.preventDefault();
        const projectId = routeProjectId(route);
        if (projectId !== undefined) navigate({ name: "newChat", projectId });
        else setCreating(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [route]);

  const { usage } = planUsage;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <a className="brand" href={href({ name: "home" })}>
            Kickoff
          </a>
          <button className="search-button" onClick={() => setPalette(true)} title="検索（⌘K）">
            <Search size={14} />
            <span>検索</span>
            <kbd>⌘K</kbd>
          </button>
        </div>
        <nav className="sidebar-section">
          <div className="sidebar-label-row">
            <span className="sidebar-label">プロジェクト</span>
            <button className="icon-button" title="新しいプロジェクト" aria-label="新しいプロジェクト" onClick={() => setCreating(true)}>
              <Plus size={15} />
            </button>
          </div>
          {projects.length === 0 ? (
            <button className="sidebar-new" onClick={() => setCreating(true)}>
              <Plus size={14} /> 新しいプロジェクト
            </button>
          ) : (
            <ProjectNav projects={projects} approvals={approvals} route={route} />
          )}
        </nav>
        <div className="sidebar-footer">
          <a className={`nav-item ${route.name === "settings" ? "active" : ""}`} href={href({ name: "settings" })}>
            <Settings size={15} /> 設定
          </a>
        </div>
      </aside>
      <main className="main">
        {route.name === "settings" ? (
          <SettingsPage />
        ) : route.name === "run" ? (
          <RunPage key={route.runId} projectId={route.projectId} runId={route.runId} focus={route.focus} />
        ) : route.name === "newChat" ? (
          <NewChatPage key={`${route.projectId}:${route.section ?? ""}`} projectId={route.projectId} section={route.section} />
        ) : route.name === "project" ? (
          <ProjectPage id={route.id} tab={route.tab} />
        ) : (
          <HomePage planUsage={planUsage} projects={projects} approvals={approvals} onNewProject={() => setCreating(true)} />
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
            navigate({ name: "newChat", projectId: project.id, section: "requirements" });
          }}
        />
      )}
      {palette && <CommandPalette projects={projects} onClose={() => setPalette(false)} />}
      {searching && (
        <SearchPanel
          runId={route.name === "run" ? route.runId : undefined}
          projectId={routeProjectId(route)}
          onClose={() => setSearching(false)}
        />
      )}
    </div>
  );
}

const CONNECTION_LABELS = { connecting: "接続中…", open: "接続済み", closed: "切断" } as const;
