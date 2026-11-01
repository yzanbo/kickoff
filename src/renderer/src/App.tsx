import { Search, Settings, SquareKanban, SquarePen } from "lucide-react";
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
        startNewChat();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [route]);

  const { usage } = planUsage;

  /** 新しいチャット: 開いている（なければサイドバーで選んでいる）プロジェクトで始める */
  function startNewChat() {
    const projectId = routeProjectId(route) ?? (Number(localStorage.getItem("kickoff:current-project")) || projects[0]?.id);
    if (projectId) navigate({ name: "newChat", projectId });
    else setCreating(true);
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <a className="brand" href={href({ name: "home" })}>
            Kickoff
          </a>
        </div>
        <div className="nav-rows">
          <button className="nav-row" onClick={startNewChat} title="新しいチャット（⌘N）">
            <SquarePen size={15} /> 新しいチャット <kbd>⌘N</kbd>
          </button>
          <a className={`nav-row ${route.name === "home" ? "active" : ""}`} href={href({ name: "home" })}>
            <SquareKanban size={15} /> カンバン
          </a>
          <button className="nav-row" onClick={() => setPalette(true)}>
            <Search size={15} /> 検索 <kbd>⌘K</kbd>
          </button>
        </div>
        <nav className="sidebar-section" aria-label="プロジェクトとチャット">
          <ProjectNav projects={projects} approvals={approvals} route={route} onNewProject={() => setCreating(true)} />
        </nav>
        <div className="sidebar-footer">
          <a className={`nav-item ${route.name === "settings" ? "active" : ""}`} href={href({ name: "settings" })}>
            <Settings size={15} /> 設定
          </a>
        </div>
      </aside>
      <main className="main">
        {route.name === "settings" ? (
          <SettingsPage planUsage={planUsage} />
        ) : route.name === "run" ? (
          <RunPage key={route.runId} projectId={route.projectId} runId={route.runId} focus={route.focus} />
        ) : route.name === "newChat" ? (
          <NewChatPage
            key={`${route.projectId}:${route.section ?? ""}:${route.stage ?? ""}`}
            projectId={route.projectId}
            section={route.section}
            stage={route.stage}
          />
        ) : route.name === "project" ? (
          <ProjectPage id={route.id} tab={route.tab} projects={projects} />
        ) : (
          <HomePage projects={projects} approvals={approvals} onNewProject={() => setCreating(true)} />
        )}
      </main>
      <footer className="app-footer">
        <span className={`conn conn-${connection}`} title="サーバーとの接続">
          {CONNECTION_LABELS[connection]}
        </span>
        <span className="spacer" />
        {usage?.available ? (
          <a className="footer-usage" href={href({ name: "settings" })} title="使用状況の詳細">
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
