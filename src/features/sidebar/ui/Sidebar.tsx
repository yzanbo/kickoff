import { AppWindow, LayoutGrid, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { KeyHint, useCommandKeys } from "@/foundation/ui/commands";
import { useLayoutEffect } from "react";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { markInteractive } from "@/foundation/ui/lib/bootMarks";
import { canPopout, openPopout } from "@/foundation/ui/navigation/popout";
import { cx } from "@/foundation/ui/lib/cx";
import { href, useRoute } from "@/foundation/ui/navigation/router";
import { ProjectNav } from "./ProjectNav";
import { chatListSettings } from "@/features/chatList/ui";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { useChatsByProject, useChatsLoaded } from "@/features/chat/ui/store/knownChats";
import { useGroupsOf } from "@/features/groups/ui/stores/groups";
import type { SidebarController } from "./useSidebar";
import { ChatSelectionContext, useChatSelectionState, visibleRows } from "@/features/chatList/ui";
import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { NewChatButton } from "./NewChatButton";
import { ensureAllRows } from "@/foundation/ui/hooks/useProgressiveRows";
import { stepIndex } from "@/foundation/ui/kit/list/useRovingList";

interface Props {
  /** 開閉と幅（メインのウィンドウ）。なければ別ウィンドウのサイドバー（ウィンドウいっぱいに出し、開閉・幅のつまみ・信号機ボタンの行を置かない） */
  sidebar?: SidebarController;
  onNewChat: () => void;
  /** ⌘N の新しいチャットを始めるプロジェクト（開いているもの。なければサイドバーで選んでいるもの。プロジェクトがひとつもなければ undefined） */
  newChatProject: number | undefined;
  onSearch: () => void;
  onNewProject: () => void;
}

/**
 * 左のサイドバー（新しいチャット・全プロジェクト・検索、プロジェクトごとのチャット一覧、設定）。要対応のオン / オフは一覧の上の見出しの「要対応」の行
 * （上の段は押すと開く・作るものだけにする）
 */
export function Sidebar({ sidebar, onNewChat, newChatProject, onSearch, onNewProject }: Props) {
  const route = useRoute();
  const toggleKeys = useCommandKeys("sidebar.toggle") ?? undefined;
  const { projects, loaded: projectsLoaded } = useProjects();
  // プロジェクトとチャットの一覧が初めて届いて描けたら、起動の時刻の記録に知らせる（app/bootMarks.ts）
  const chatsLoaded = useChatsLoaded();
  useLayoutEffect(() => {
    if (projectsLoaded && chatsLoaded) markInteractive("sidebar");
  }, [projectsLoaded, chatsLoaded]);
  // すべてのプロジェクトのチャット（アーカイブ済みは、一覧の下に出すときだけ）とグループ（スライドしたときにすぐ見えるよう、しまったプロジェクトの分も先に読み込む）
  const [showArchivedChats] = useSetting(chatListSettings.showArchived);
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
    // 開いた直後でまだ描いていない行があれば、先にすべて描く（最後の行まで移れるように）
    ensureAllRows();
    const rows = visibleRows();
    if (rows.length === 0) return;
    const current = rows.indexOf(target.closest<HTMLElement>("a.chat-row") as HTMLElement);
    // 端では回り込む（最後の次は先頭。候補・メニューと同じ決まり）
    const next = rows[stepIndex(current, e.key === "ArrowDown" ? 1 : -1, rows.length)];
    e.preventDefault();
    next.focus();
    next.scrollIntoView({ block: "nearest" });
    if (e.shiftKey) {
      if (current >= 0) selection.add(Number(rows[current].dataset.chatId));
      selection.add(Number(next.dataset.chatId));
    }
  });
  const hidden = sidebar ? !sidebar.open : undefined;
  return (
    <aside ref={sidebar?.paneRef} className={cx("sidebar", !sidebar && "sidebar-window")} aria-hidden={hidden} inert={hidden}>
      {sidebar && <div className="sidebar-resizer" aria-label="サイドバーの幅を変える" {...sidebar.resizeHandle} />}
      {/* 一番上の行は macOS の信号機ボタンの行。右端に別ウィンドウで開く・開閉のボタンを置き、残りはウィンドウのドラッグ領域 */}
      {sidebar && (
        <div className="sidebar-header">
          {canPopout() && (
            <IconButton
              icon={AppWindow}
              size="xs"
              className="titlebar-toggle sidebar-popout-button"
              label="サイドバーを別ウィンドウで開く"
              title="サイドバーを別ウィンドウに移す（このウィンドウのサイドバーは閉じる。別ウィンドウの「左の欄に戻す」で戻せる）"
              onClick={() => {
                openPopout({ kind: "sidebar" }, "サイドバー");
                if (sidebar.open) sidebar.toggle();
              }}
            />
          )}
          <IconButton icon={PanelLeftClose} size="xs" className="titlebar-toggle" label="サイドバーを閉じる" keys={toggleKeys} onClick={sidebar.toggle} />
        </div>
      )}
      <div className="nav-rows">
        <NewChatButton projectId={newChatProject} onClick={onNewChat} />
        <a className={`nav-row ${route.name === "allProjects" ? "active" : ""}`} href={href({ name: "allProjects" })}>
          <LayoutGrid size={15} /> 全プロジェクト
        </a>
        <button className="nav-row" onClick={onSearch}>
          <Search size={15} /> 検索 <KeyHint command="palette.open" />
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
  const toggleKeys = useCommandKeys("sidebar.toggle") ?? undefined;
  if (sidebar.open) return null;
  return (
    <IconButton icon={PanelLeftOpen} size="xs" className="titlebar-toggle fixed" label="サイドバーを開く" keys={toggleKeys} onClick={sidebar.toggle} />
  );
}
