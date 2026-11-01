import { PanelLeftClose, PanelLeftOpen, Search, SquareKanban, SquarePen } from "lucide-react";
import type { Approval, ProjectSummary } from "../../../../core/types";
import { href, type Route } from "../../router";
import { ProjectNav } from "./ProjectNav";
import type { SidebarController } from "./useSidebar";

interface Props {
  sidebar: SidebarController;
  route: Route;
  projects: ProjectSummary[];
  approvals: Approval[];
  onNewChat: () => void;
  onSearch: () => void;
  onNewProject: () => void;
}

/** 左のサイドバー（新しいチャット・カンバン・検索、プロジェクトごとのチャット一覧、設定） */
export function Sidebar({ sidebar, route, projects, approvals, onNewChat, onSearch, onNewProject }: Props) {
  return (
    <aside className="sidebar" aria-hidden={!sidebar.open} inert={!sidebar.open}>
      <div
        className="sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="サイドバーの幅を変える"
        title="ドラッグで幅を変える"
        onPointerDown={sidebar.startResize}
        onDoubleClick={sidebar.resetWidth}
      />
      {/* 一番上の行は macOS の信号機ボタンの行。そのすぐ右に開閉ボタンを置き、残りはウィンドウのドラッグ領域 */}
      <div className="sidebar-header">
        <button className="titlebar-toggle" title="サイドバーを閉じる（⌘B）" aria-label="サイドバーを閉じる" onClick={sidebar.toggle}>
          <PanelLeftClose size={14} strokeWidth={1.75} />
        </button>
      </div>
      <div className="nav-rows">
        <button className="nav-row" onClick={onNewChat} title="新しいチャット（⌘N）">
          <SquarePen size={15} /> 新しいチャット <kbd>⌘N</kbd>
        </button>
        <a className={`nav-row ${route.name === "home" ? "active" : ""}`} href={href({ name: "home" })}>
          <SquareKanban size={15} /> カンバン
        </a>
        <button className="nav-row" onClick={onSearch}>
          <Search size={15} /> 検索 <kbd>⌘K</kbd>
        </button>
      </div>
      <nav className="sidebar-section" aria-label="プロジェクトとチャット">
        <ProjectNav projects={projects} approvals={approvals} route={route} onNewProject={onNewProject} />
      </nav>
    </aside>
  );
}

/**
 * 閉じているときの「開く」ボタン。Electron のドラッグ領域（見出しなど）は後に書かれた要素が優先されるので、
 * 押せなくならないよう、画面のいちばん後ろに置く
 */
export function SidebarOpenButton({ sidebar }: { sidebar: SidebarController }) {
  if (sidebar.open) return null;
  return (
    <button className="titlebar-toggle floating" title="サイドバーを開く（⌘B）" aria-label="サイドバーを開く" onClick={sidebar.toggle}>
      <PanelLeftOpen size={14} strokeWidth={1.75} />
    </button>
  );
}
