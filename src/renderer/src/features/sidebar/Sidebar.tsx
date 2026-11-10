import { LayoutGrid, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { useProjects } from "@/stores/projects";
import { href, useRoute } from "@/app/router";
import { ProjectNav } from "./ProjectNav";
import { useShowArchivedChats } from "@/features/chatList/chatListFlags";
import { useChatsByProject } from "@/stores/chats";
import { useGroupsOf } from "@/stores/groups";
import type { SidebarController } from "./useSidebar";
import { ChatSelectionContext, useChatSelectionState, visibleRows } from "./chatSelection";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { IconButton } from "@/ui/IconButton";
import { NewChatButton } from "./NewChatButton";

interface Props {
  sidebar: SidebarController;
  onNewChat: () => void;
  /** ⌘N の新しいチャットを始めるプロジェクト（開いているもの。なければサイドバーで選んでいるもの。プロジェクトがひとつもなければ undefined） */
  newChatProject: number | undefined;
  onSearch: () => void;
  onNewProject: () => void;
}

/**
 * 左のサイドバー（新しいチャット・全プロジェクト・検索、プロジェクトごとのチャット一覧、設定）。要対応のオン / オフは一覧の上の見出しの「要対応」の行
 * （利用者の依頼で、上の段から移した。上の段は押すと開く・作るものだけにする）
 */
export function Sidebar({ sidebar, onNewChat, newChatProject, onSearch, onNewProject }: Props) {
  const route = useRoute();
  const { projects } = useProjects();
  // すべてのプロジェクトのチャット（アーカイブ済みは、一覧の下に出すときだけ）とグループ（スライドしたときにすぐ見えるよう、しまったプロジェクトの分も先に読み込む）
  const [showArchivedChats] = useShowArchivedChats();
  const chats = useChatsByProject({ archived: showArchivedChats });
  const groupsOf = useGroupsOf(projects.map((p) => p.id));
  const groups = Object.fromEntries(projects.map((p) => [p.id, groupsOf(p.id)]));
  // チャットの複数選択（⌘ / Shift を押しながらクリック）。サイドバー全体で 1 つ
  const selection = useChatSelectionState(Object.values(chats).flatMap((list) => list.map((r) => r.id)));
  // ↑↓ でチャットを移る（サイドバーにピントがあるとき。Space で開き、Enter で名前を変える（ChatRow）。Shift を押しながらで選ぶものに足す）
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
      if (current >= 0) selection.add(Number(rows[current].dataset.chatId));
      selection.add(Number(next.dataset.chatId));
    }
  });
  return (
    <aside ref={sidebar.paneRef} className="sidebar" aria-hidden={!sidebar.open} inert={!sidebar.open}>
      <div className="sidebar-resizer" aria-label="サイドバーの幅を変える" {...sidebar.resizeHandle} />
      {/* 一番上の行は macOS の信号機ボタンの行。右端に開閉ボタンを置き、残りはウィンドウのドラッグ領域 */}
      <div className="sidebar-header">
        <IconButton icon={PanelLeftClose} className="titlebar-toggle" label="サイドバーを閉じる" keys="⌘B" onClick={sidebar.toggle} />
      </div>
      <div className="nav-rows">
        <NewChatButton projectId={newChatProject} onClick={onNewChat} />
        <a className={`nav-row ${route.name === "allProjects" ? "active" : ""}`} href={href({ name: "allProjects" })}>
          <LayoutGrid size={15} /> 全プロジェクト
        </a>
        <button className="nav-row" onClick={onSearch}>
          <Search size={15} /> 検索 <kbd>⌘K</kbd>
        </button>
      </div>
      <nav className="sidebar-section" aria-label="プロジェクトとチャット">
        <ChatSelectionContext.Provider value={selection}>
          <ProjectNav chats={chats} groups={groups} onNewProject={onNewProject} />
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
    <IconButton icon={PanelLeftOpen} className="titlebar-toggle floating" label="サイドバーを開く" keys="⌘B" onClick={sidebar.toggle} />
  );
}
