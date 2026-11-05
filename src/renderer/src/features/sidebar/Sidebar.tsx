import { Inbox, LayoutGrid, PanelLeftClose, PanelLeftOpen, Search, SquarePen } from "lucide-react";
import { cx } from "@/lib/cx";
import { useSetting } from "@/hooks/useSetting";
import { useProjects } from "@/stores/projects";
import { useVisibleProjects } from "@/features/project/useVisibleProjects";
import { useChatStates } from "@/app/chatStatesContext";
import { href, useRoute } from "@/app/router";
import { ProjectNav } from "./ProjectNav";
import { SIDEBAR_WAITING_ONLY } from "@/lib/storageKeys";
import { useShowArchivedChats, waitingChats } from "@/features/chatList/chatListFlags";
import { useChatsByProject } from "@/stores/chats";
import { useGroupsOf } from "@/stores/groups";
import type { SidebarController } from "./useSidebar";
import { ChatSelectionContext, useChatSelectionState, visibleRows } from "./chatSelection";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { IconButton } from "@/ui/IconButton";
import { ChoiceMenu } from "@/ui/ChoiceMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { useWaitingView, WAITING_VIEW_META, WAITING_VIEWS, type WaitingView } from "./waitingView";

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
  const { pending } = useChatStates();
  // すべてのプロジェクトのチャット（アーカイブ済みは、一覧の下に出すときだけ）とグループ（スライドしたときにすぐ見えるよう、しまったプロジェクトの分も先に読み込む）
  const [showArchivedChats] = useShowArchivedChats();
  const chats = useChatsByProject({ archived: showArchivedChats });
  const groupsOf = useGroupsOf(projects.map((p) => p.id));
  const groups = Object.fromEntries(projects.map((p) => [p.id, groupsOf(p.id)]));
  // 自分待ち（回答待ち・未読）のチャットだけを出す切り替えと、その数（しまったプロジェクトは数えない）。
  const [waitingOnly, setWaitingOnly] = useSetting(SIDEBAR_WAITING_ONLY);
  // 自分待ちがオンのときの表示（上の行の「自分待ち」の右クリックで選ぶ）
  const [waitingView, setWaitingView] = useWaitingView();
  const waitingMenu = useContextMenu();
  // タグで絞り込んでいれば、出しているプロジェクトの分だけを数える（押して出る一覧と合わせる）
  const { visible } = useVisibleProjects();
  const waitingCount = visible.reduce((n, p) => n + waitingChats(chats[p.id] ?? [], pending).length, 0);
  // チャットの複数選択（⌘ / Shift を押しながらクリック）。サイドバー全体で 1 つ
  const selection = useChatSelectionState(Object.values(chats).flatMap((list) => list.map((r) => r.id)));
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
        <button className="nav-row" onClick={onNewChat} title="新しいチャット（⌘N）">
          <SquarePen size={15} /> 新しいチャット <kbd>⌘N</kbd>
        </button>
        <a className={`nav-row ${route.name === "allProjects" ? "active" : ""}`} href={href({ name: "allProjects" })}>
          <LayoutGrid size={15} /> 全プロジェクト
        </a>
        {/*
          自分待ちは画面ではなく一覧の絞り込みなので、オンは開いている画面の印（active）と別の見た目（on と「オン」の札）。
          右クリックで、オンのときの表示（プロジェクトで絞る / 上にまとめる / 1 列にまとめる）を選ぶ（選ぶとオンにする）
        */}
        <button
          className={cx("nav-row waiting-toggle", waitingOnly && "on")}
          aria-pressed={waitingOnly}
          title={waitingOnly ? "すべてのチャットを表示（右クリックで表示を選ぶ）" : "回答待ち・未読のチャットだけを表示（右クリックで表示を選ぶ）"}
          onClick={() => setWaitingOnly(!waitingOnly)}
          onContextMenu={waitingMenu.open}
        >
          <Inbox size={15} /> 自分待ち
          {waitingOnly && <span className="nav-row-state">オン</span>}
          {waitingCount > 0 && <span className="count-badge">{waitingCount}</span>}
        </button>
        {waitingMenu.menu && (
          <ChoiceMenu
            at={waitingMenu.menu.at}
            title="自分待ちの表示"
            values={WAITING_VIEWS}
            labels={Object.fromEntries(WAITING_VIEWS.map((v) => [v, WAITING_VIEW_META[v].label])) as Record<WaitingView, string>}
            icons={Object.fromEntries(WAITING_VIEWS.map((v) => [v, WAITING_VIEW_META[v].icon]))}
            value={waitingView}
            ignore=".waiting-toggle"
            onPick={(view) => {
              setWaitingView(view);
              setWaitingOnly(true);
            }}
            onClose={waitingMenu.close}
          />
        )}
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
