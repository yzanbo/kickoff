import { PanelLeftClose, PanelLeftOpen, Search, Settings, SquareKanban, SquarePen } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Approval, BusEvent, ProjectSummary } from "../../core/types";
import { api, useServerEvents } from "./api";
import { CommandPalette } from "./components/CommandPalette";
import { NewProjectDialog } from "./components/NewProjectDialog";
import { ProjectNav } from "./components/ProjectNav";
import { SearchPanel } from "./components/SearchPanel";
import { UsageMeter } from "./components/UsageMeter";
import { ConnectionPopover, CONNECTION_LABELS } from "./components/ConnectionPopover";
import { UsagePopover } from "./components/UsagePopover";
import { publishServerEvent } from "./events";
import { HomePage } from "./pages/HomePage";
import { ProjectPage } from "./pages/ProjectPage";
import { SettingsPage } from "./pages/SettingsPage";
import { href, openNewChat, routeProjectId, useRoute } from "./router";
import { applyTheme, loadTheme } from "./theme";
import { useRunNotifications } from "./notifications";
import { FIVE_HOUR_IDLE, planLabel, PlanUsageContext, usePlanUsage } from "./usage";
import { DialogHost } from "./dialogs";

applyTheme(loadTheme());

export function App() {
  const route = useRoute();
  const planUsage = usePlanUsage();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [creating, setCreating] = useState(false);
  const [palette, setPalette] = useState(false);
  // フッターの使用状況の詳細（右下に出すだけで、画面は移らない）
  const [usageOpen, setUsageOpen] = useState(false);
  const closeUsage = useCallback(() => setUsageOpen(false), []);
  // 左下の接続の詳細（左下に出すだけで、画面は移らない）
  const [connOpen, setConnOpen] = useState(false);
  const closeConn = useCallback(() => setConnOpen(false), []);
  // サイドバーの開閉（⌘B）。状態は覚えておく
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem("kickoff:sidebar") !== "closed");
  // サイドバーの幅（右端をドラッグで変更、ダブルクリックで既定に戻す）
  const layoutRef = useRef<HTMLDivElement>(null);
  const [sidebarWidth, setSidebarWidth] = useState(
    () => clampSidebar(Number(localStorage.getItem("kickoff:sidebar-width")) || DEFAULT_SIDEBAR_WIDTH),
  );
  const [resizingSidebar, setResizingSidebar] = useState(false);
  const saveSidebarWidth = (width: number) => {
    setSidebarWidth(width);
    localStorage.setItem("kickoff:sidebar-width", String(width));
  };
  const startSidebarResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const handle = e.currentTarget;
    const layout = layoutRef.current;
    if (!layout) return;
    handle.setPointerCapture(e.pointerId);
    setResizingSidebar(true);
    let width = sidebarWidth;
    const onMove = (ev: PointerEvent) => {
      width = clampSidebar(ev.clientX);
      // ドラッグ中は再描画せず、CSS の変数だけを書き換えて指に追従させる
      layout.style.setProperty("--sidebar-w", `${width}px`);
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      setResizingSidebar(false);
      saveSidebarWidth(width);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  };
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((open) => {
      localStorage.setItem("kickoff:sidebar", open ? "closed" : "open");
      return !open;
    });
  }, []);
  const [searching, setSearching] = useState(false);
  const [projectsDir, setProjectsDir] = useState("~/Documents");

  const loadProjects = useCallback(() => {
    api.projects().then(setProjects).catch(() => {});
  }, []);

  useEffect(() => {
    loadProjects();
    api
      .settings()
      .then((s) => {
        setProjectsDir(s.projectsDir);
        setNotifyEnabled(s.desktopNotifications);
      })
      .catch(() => {});
    api.approvals().then(setApprovals).catch(() => {});
  }, [loadProjects]);

  // チャットの完了・失敗・回答待ちを Mac の通知で知らせる（設定で切り替え）
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  useRunNotifications({ enabled: notifyEnabled, projects, route });

  const { state: connection, since: connectedSince } = useServerEvents((event: BusEvent) => {
    planUsage.onEvent(event);
    if (event.type === "settings") setNotifyEnabled(event.settings.desktopNotifications);
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
      if (e.key === "b") {
        e.preventDefault();
        toggleSidebar();
      } else if (e.key === "k") {
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
  }, [route, toggleSidebar]);

  const { usage } = planUsage;

  /** 新しいチャット: 開いている（なければサイドバーで選んでいる）プロジェクトで始める */
  function startNewChat() {
    const projectId = routeProjectId(route) ?? (Number(localStorage.getItem("kickoff:current-project")) || projects[0]?.id);
    if (projectId) openNewChat(projectId);
    else setCreating(true);
  }

  return (
    <PlanUsageContext.Provider value={planUsage}>
    <div
      ref={layoutRef}
      className={`layout ${sidebarOpen ? "" : "sidebar-collapsed"} ${resizingSidebar ? "resizing-sidebar" : ""}`}
      style={{ "--sidebar-w": `${sidebarWidth}px` } as React.CSSProperties}
    >
      <aside className="sidebar" aria-hidden={!sidebarOpen} inert={!sidebarOpen}>
        <div
          className="sidebar-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="サイドバーの幅を変える"
          title="ドラッグで幅を変える"
          onPointerDown={startSidebarResize}
          onDoubleClick={() => saveSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
        />
        {/* 一番上の行は macOS の信号機ボタンの行。そのすぐ右に開閉ボタンを置き、残りはウィンドウのドラッグ領域 */}
        <div className="sidebar-header">
          <button className="titlebar-toggle" title="サイドバーを閉じる（⌘B）" aria-label="サイドバーを閉じる" onClick={toggleSidebar}>
            <PanelLeftClose size={14} strokeWidth={1.75} />
          </button>
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
        ) : route.name === "project" || route.name === "run" || route.name === "newChat" ? (
          // チャット・新しいチャットはプロジェクトのカンバンの右側のパネルで開く（同じ要素のままなので、開いているタブは残る）
          <ProjectPage
            id={route.name === "project" ? route.id : route.projectId}
            // サイドバーのグループの＋から来たときは、グループのタブで始める
            tab={route.name === "project" ? route.tab : route.name === "newChat" && route.group ? "groups" : "board"}
            projects={projects}
            focus={route.name === "project" ? undefined : route}
            highlightGroup={route.name === "project" ? route.group : undefined}
          />
        ) : (
          <HomePage projects={projects} approvals={approvals} onNewProject={() => setCreating(true)} />
        )}
      </main>
      <footer className="app-footer">
        <button
          className={`conn conn-${connection} ${connOpen ? "active" : ""}`}
          title="接続の詳細"
          aria-expanded={connOpen}
          onClick={() => setConnOpen((o) => !o)}
        >
          {CONNECTION_LABELS[connection]}
        </button>
        <span className="spacer" />
        {usage?.plan && (
          <span className="plan-chip" title={`${usage.provider_label} でログインしているアカウントの契約プラン`}>
            {usage.provider_label} {planLabel(usage.plan)}
          </span>
        )}
        {usage?.available ? (
          <button
            className={`footer-usage ${usageOpen ? "active" : ""}`}
            title="使用状況の詳細"
            aria-expanded={usageOpen}
            onClick={() => setUsageOpen((o) => !o)}
          >
            <UsageMeter window={usage.five_hour} inline idleText={FIVE_HOUR_IDLE} />
            <UsageMeter window={usage.seven_day} inline />
            {/* モデル別の週枠（Fable など）。フッターでは短く「Fable」と表示する */}
            {usage.model_weekly.map((w) => (
              <UsageMeter key={w.key} window={{ ...w, label: w.label.replace(/^週（(.+)）$/, "$1") }} inline />
            ))}
          </button>
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
            openNewChat(project.id, { section: "requirements" });
          }}
        />
      )}
      {/*
        閉じているときの「開く」ボタン。Electron のドラッグ領域（見出しなど）は後に書かれた要素が優先されるので、
        押せなくならないよう、画面のいちばん後ろに置く
      */}
      {!sidebarOpen && (
        <button className="titlebar-toggle floating" title="サイドバーを開く（⌘B）" aria-label="サイドバーを開く" onClick={toggleSidebar}>
          <PanelLeftOpen size={14} strokeWidth={1.75} />
        </button>
      )}
      <DialogHost />
      {connOpen && <ConnectionPopover state={connection} since={connectedSince} onClose={closeConn} />}
      {usageOpen && (
        <UsagePopover
          planUsage={planUsage}
          plan={usage?.plan ? `${usage.provider_label} ${planLabel(usage.plan)}` : null}
          onClose={closeUsage}
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
    </PlanUsageContext.Provider>
  );
}

const DEFAULT_SIDEBAR_WIDTH = 260;
/** サイドバーの幅は 200〜480px（狭くしすぎ・広げすぎを防ぐ） */
function clampSidebar(width: number): number {
  return Math.round(Math.max(200, Math.min(480, width)));
}

