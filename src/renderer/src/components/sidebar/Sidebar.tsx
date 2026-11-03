import { Inbox, LayoutGrid, PanelLeftClose, PanelLeftOpen, Search, SquarePen } from "lucide-react";
import { cx } from "../../cx";
import { useSharedFlag } from "../../hooks/useStoredState";
import { sidebarOrder } from "../../projectOrder";
import { useProjects } from "../../projectsContext";
import { useProjectTagFilter } from "../../projectTagFilter";
import { useRunStates } from "../../approvalsContext";
import { href, useRoute } from "../../router";
import { ProjectNav } from "./ProjectNav";
import { SIDEBAR_WAITING_ONLY_KEY } from "../../storageKeys";
import { waitingRuns } from "./sidebarFlags";
import type { SidebarController } from "./useSidebar";
import { useSidebarData } from "./useSidebarData";
import { ChatSelectionContext, useChatSelectionState, visibleRows } from "./chatSelection";
import { useWindowEvent } from "../../hooks/useWindowEvent";

interface Props {
  sidebar: SidebarController;
  onNewChat: () => void;
  onSearch: () => void;
  onNewProject: () => void;
}

/** 左のサイドバー（新しいチャット・全プロジェクト・自分待ち・検索、プロジェクトごとのチャット一覧、設定） */
export function Sidebar({ sidebar, onNewChat, onSearch, onNewProject }: Props) {
  const route = useRoute();
  const { projects } = useProjects();
  const { pending } = useRunStates();
  // すべてのプロジェクトのチャットとグループ（スライドしたときにすぐ見えるよう、しまったプロジェクトの分も先に読み込む）
  const { runs, groups } = useSidebarData(projects);
  // 自分待ち（回答待ち・未読）のチャットだけを出す切り替えと、その数（しまったプロジェクトは数えない）。
  const [waitingOnly, setWaitingOnly] = useSharedFlag(SIDEBAR_WAITING_ONLY_KEY);
  // タグで絞り込んでいれば、出しているプロジェクトの分だけを数える（押して出る一覧と合わせる）
  const tagFilter = useProjectTagFilter();
  const waitingCount = sidebarOrder(projects)
    .filter(tagFilter.matches)
    .reduce((n, p) => n + waitingRuns(runs[p.id] ?? [], pending).length, 0);
  // チャットの複数選択（⌘ / Shift を押しながらクリック）。サイドバー全体で 1 つ
  const selection = useChatSelectionState(new Set(Object.values(runs).flatMap((list) => list.map((r) => r.id))));
  // ↑↓ でチャットを移る（サイドバーにピントがあるとき。Enter で開く。Shift を押しながらで選ぶものに足す）
  useWindowEvent("keydown", (e) => {
    if ((e.key !== "ArrowDown" && e.key !== "ArrowUp") || e.metaKey || e.altKey || e.ctrlKey) return;
    const target = e.target as HTMLElement | null;
    if (!target?.closest(".sidebar-section") || target.closest("input, textarea, select, [role=menu]")) return;
    const rows = visibleRows();
    if (rows.length === 0) return;
    const current = rows.indexOf(target.closest<HTMLElement>("a.chat-row") as HTMLElement);
    const step = e.key === "ArrowDown" ? 1 : -1;
    const next = rows[current < 0 ? (step > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, current + step))];
    e.preventDefault();
    next.focus();
    next.scrollIntoView({ block: "nearest" });
    if (e.shiftKey) {
      if (current >= 0) selection.add(Number(rows[current].dataset.runId));
      selection.add(Number(next.dataset.runId));
    }
  });
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
      {/* 一番上の行は macOS の信号機ボタンの行。右端に開閉ボタンを置き、残りはウィンドウのドラッグ領域 */}
      <div className="sidebar-header">
        <button className="titlebar-toggle" title="サイドバーを閉じる（⌘B）" aria-label="サイドバーを閉じる" onClick={sidebar.toggle}>
          <PanelLeftClose size={14} strokeWidth={1.75} />
        </button>
      </div>
      <div className="nav-rows">
        <button className="nav-row" onClick={onNewChat} title="新しいチャット（⌘N）">
          <SquarePen size={15} /> 新しいチャット <kbd>⌘N</kbd>
        </button>
        <a className={`nav-row ${route.name === "allProjects" ? "active" : ""}`} href={href({ name: "allProjects" })}>
          <LayoutGrid size={15} /> 全プロジェクト
        </a>
        <button
          className={cx("nav-row", waitingOnly && "active")}
          aria-pressed={waitingOnly}
          title={waitingOnly ? "すべてのチャットを表示" : "回答待ち・未読のチャットだけを表示"}
          onClick={() => setWaitingOnly(!waitingOnly)}
        >
          <Inbox size={15} /> 自分待ち
          {waitingCount > 0 && <span className="count-badge">{waitingCount}</span>}
        </button>
        <button className="nav-row" onClick={onSearch}>
          <Search size={15} /> 検索 <kbd>⌘K</kbd>
        </button>
      </div>
      <nav className="sidebar-section" aria-label="プロジェクトとチャット">
        <ChatSelectionContext.Provider value={selection}>
          <ProjectNav runs={runs} groups={groups} onNewProject={onNewProject} />
        </ChatSelectionContext.Provider>
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
