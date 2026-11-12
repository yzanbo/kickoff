import { Bot, ChevronDown, ChevronRight, Database, FileDiff, GitPullRequest, MessageSquarePlus, MessagesSquare, StickyNote, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { chatTitle } from "@/features/chat/chatTitle";
import { openChildChat } from "@/features/chat/children/openChild";
import { useOptionalChatPane } from "@/features/chat/pane/chatPaneContext";
import { useSubagentsView } from "@/features/chat/subagents/subagentsContext";
import { flattenTree } from "@/features/chat/subagents/subagentTree";
import { DbMenuItems } from "@/features/database/DbMenuItems";
import { RecentMemoItems } from "@/features/memo/MemoMenuItems";
import { parsePanelKey } from "@/features/panel/surfaces";
import { PROJECT_VIEW_LABELS, type ProjectView } from "@/features/panel/tabs/panelTypes";
import { PROJECT_VIEW_ICONS } from "@/features/panel/tabs/ProjectViewTabLead";
import type { PanelController } from "@/features/panel/usePanel";
import { useSetting } from "@/hooks/useSetting";
import { subagentsArchived } from "@/lib/storageKeys";
import { useChildChats, useKnownChat } from "@/stores/chats";
import { IconButton } from "@/ui/IconButton";
import { MenuFlyout, useSubmenu } from "@/ui/MenuFlyout";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";

/**
 * 右の欄のタブの列の新しいタブのボタン: 「新しい子チャット」と、横の ▾ で、ほかに右の欄に開けるもののメニュー（2 つを 1 つのボタンに見せる .panel-split-button）。
 * メニューは 新しい子チャット ｜ 子チャット ▸（このチャットの子）・サブエージェント ▸（アーカイブしたものは除く）｜ ファイル・検索・変更・履歴（プロジェクトの左の列のタブと同じ画面。
 * 作業場所はこのチャットの作業場所から）｜ メモ ▸（最近変えた 12 件）・DB ▸（DB クライアントと、接続ごとの新しい SQL のタブ。この Mac のアプリの中だけ）。
 * どれも設定の開き方によらず、この右の欄に開く（▸ の一覧が空なら押せない）
 */
export function AgentPanelAdds({ panel, onNewChild }: { panel: PanelController; onNewChild: () => void }) {
  const menu = useContextMenu({ align: "end" });
  return (
    <span className="panel-bar-buttons panel-tab-adds">
      <span className="panel-split-button">
        <IconButton icon={MessageSquarePlus} label="新しい子チャット" size={14} onClick={onNewChild} />
        <IconButton
          icon={ChevronDown}
          label="右の欄に開く"
          title="新しい子チャット・子チャット・サブエージェント・ファイル・検索・変更・履歴・メモ・DB から選んで、右の欄に開く"
          size={12}
          className="panel-open-with agent-panel-adds-more"
          aria-haspopup="menu"
          aria-expanded={menu.isOpen}
          onClick={(e) => menu.toggle(e)}
        />
      </span>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="右の欄に開く" ignore=".agent-panel-adds-more" onClose={menu.close}>
          <AgentPanelAddItems panel={panel} onNewChild={onNewChild} />
        </PopupMenu>
      )}
    </span>
  );
}

/** メニューの中身（開いている間だけ描くので、一覧はこのときだけ読む） */
function AgentPanelAddItems({ panel, onNewChild }: { panel: PanelController; onNewChild: () => void }) {
  const at = parsePanelKey(panel.key);
  const chatId = at && typeof at.scope === "number" ? at.scope : 0;
  const chat = useKnownChat(chatId);
  const pane = useOptionalChatPane();
  const view = useSubagentsView();
  const [archivedKeys] = useSetting(subagentsArchived(chatId));
  const children = (useChildChats().get(chatId) ?? []).filter((c) => c.archived_at === null);
  // サブエージェントは入れ子を親のすぐ下に（入力欄の上の一覧と同じ並び）。アーカイブしたものは出さない
  const subagents = view ? flattenTree(view.tree).filter(({ entry }) => !archivedKeys.includes(entry.key)) : [];
  const childMenu = useSubmenu();
  const agentMenu = useSubmenu();
  const memoMenu = useSubmenu();
  const dbMenu = useSubmenu();
  if (!chat) return null;
  const worktree = chat.worktree_path ?? undefined;
  /** プロジェクトの「ファイル」「検索」「履歴」タブと同じ画面を、この右の欄に開く項目 */
  const projectView = (view: ProjectView) => {
    const Icon = PROJECT_VIEW_ICONS[view];
    return (
      <MenuItem
        title={`プロジェクトの「${PROJECT_VIEW_LABELS[view]}」タブと同じ画面を開く（このチャットの作業場所から）`}
        onSelect={() => panel.openProjectView({ chatId: chat.id, projectId: chat.project_id, view, ...(worktree ? { worktree } : {}) })}
      >
        <Icon size={14} /> {PROJECT_VIEW_LABELS[view]}
      </MenuItem>
    );
  };
  return (
    <>
      <MenuItem title="入力欄だけの新しい子チャットのタブを開く（最初の文を送ると子チャットができます）" onSelect={onNewChild}>
        <MessageSquarePlus size={14} /> 新しい子チャット
      </MenuItem>
      <div className="menu-separator" role="separator" />
      <SubmenuItem submenu={childMenu} icon={MessagesSquare} label="子チャット" empty={children.length === 0 ? "子チャットはありません" : null}>
        {children.map((c) => (
          <MenuItem key={c.id} title={chatTitle(c.title)} onSelect={() => openChildChat(c, "side")}>
            {chatTitle(c.title)}
          </MenuItem>
        ))}
      </SubmenuItem>
      {pane && (
        <SubmenuItem submenu={agentMenu} icon={Bot} label="サブエージェント" empty={subagents.length === 0 ? "サブエージェントはいません" : null}>
          {subagents.map(({ entry, depth }) => (
            <MenuItem
              key={entry.key}
              title={entry.description}
              buttonProps={depth > 0 ? { style: { paddingLeft: `calc(10px + ${Math.min(depth, 4)} * 12px)` } } : undefined}
              onSelect={() => pane.openSubagentSide(entry.key)}
            >
              {depth > 0 && <span aria-hidden>↳</span>}
              {entry.description}
            </MenuItem>
          ))}
        </SubmenuItem>
      )}
      {/* プロジェクトの左の列のコードのタブと同じ並び（ファイル・検索・変更・履歴）。作業場所はこのチャットの作業場所から */}
      <div className="menu-separator" role="separator" />
      {projectView("files")}
      {projectView("search")}
      <MenuItem
        title="このチャットの作業場所の、コミットしていない変更を開く"
        onSelect={() => panel.openChanges({ chatId: chat.id, projectId: chat.project_id, ...(worktree ? { worktree } : {}) })}
      >
        <FileDiff size={14} /> 変更
      </MenuItem>
      {projectView("history")}
      <div className="menu-separator" role="separator" />
      <SubmenuItem submenu={memoMenu} icon={StickyNote} label="メモ" empty={null}>
        <RecentMemoItems projectId={chat.project_id} onPick={(path) => panel.openMemo({ chatId: chat.id, projectId: chat.project_id, path })} />
      </SubmenuItem>
      {/* DB はこの Mac のアプリの中だけ（API が 127.0.0.1 からだけ受ける） */}
      {window.kickoff && (
        <SubmenuItem submenu={dbMenu} icon={Database} label="DB" empty={null}>
          <DbMenuItems
            projectId={chat.project_id}
            place={`chat-${chat.id}`}
            onOpen={() => panel.openDatabase({ chatId: chat.id, projectId: chat.project_id, ...(worktree ? { worktree } : {}) })}
          />
        </SubmenuItem>
      )}
      {/* GitHub もこの Mac のアプリの中だけ（API が 127.0.0.1 からだけ受ける。プロジェクトの「GitHub」タブと同じ） */}
      {window.kickoff && (
        <MenuItem title="プロジェクトの「GitHub」タブと同じ画面（issue・PR の一覧と中身）を開く" onSelect={() => panel.openGitHub({ chatId: chat.id, projectId: chat.project_id })}>
          <GitPullRequest size={14} /> GitHub
        </MenuItem>
      )}
    </>
  );
}

/** 横に一覧を開く項目（一覧が空なら押せない項目にして、理由を説明に出す） */
function SubmenuItem({
  submenu,
  icon: Icon,
  label,
  empty,
  children,
}: {
  submenu: ReturnType<typeof useSubmenu>;
  icon: LucideIcon;
  label: string;
  /** 一覧が空のときの説明（空でなければ null） */
  empty: string | null;
  children: ReactNode;
}) {
  if (empty !== null) {
    return (
      <MenuItem disabled title={empty} onSelect={() => {}}>
        <Icon size={14} /> {label}
      </MenuItem>
    );
  }
  return (
    <>
      <button {...submenu.trigger}>
        <Icon size={14} /> {label}
        <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
      </button>
      {submenu.anchor && (
        <MenuFlyout anchor={submenu.anchor} label={label} onBack={submenu.back}>
          {children}
        </MenuFlyout>
      )}
    </>
  );
}
