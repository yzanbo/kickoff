import { Bot, ChevronDown, Container, Database, FileDiff, GitPullRequest, MessageSquarePlus, MessagesSquare, StickyNote, Trash2, Workflow, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { chatTitle } from "@/features/chat/ui/chatTitle";
import { openChat } from "@/features/chat/ui";
import { chatSubagents } from "@/features/subagents/ui";
import { useOptionalSubagentNav } from "@/features/chat/ui";
import { flattenTree } from "@/features/subagents/ui/model/subagentTree";
import { DbMenuItems } from "@/features/database/ui/DbMenuItems";
import { RecentNoteItems } from "@/features/notes/ui/NoteMenuItems";
import { changesTab, databaseTab, githubTab, noteTab, openTab, parsePanelKey, projectToolTab, projectViewTab } from "@/features/panel/ui";
import { PROJECT_VIEW_LABELS, type ProjectView } from "@/features/panel/ui/tabs/panelTypes";
import { PROJECT_VIEW_ICONS } from "@/features/projects/ui/views/ProjectViewTabLead";
import type { PaneLeaf, PanelController } from "@/features/panel/ui";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { subagentsSettings } from "@/features/subagents/ui";
import { useChildChats, useKnownChat } from "@/features/chat/ui/store/knownChats";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { MenuSub } from "@/foundation/ui/kit/MenuFlyout";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { useNewChild } from "./useNewChild";

/**
 * 右の欄のタブの列の新しいタブのボタン: 「新しい子チャット」と、横の ▾ で、ほかに右の欄に開けるもののメニュー（2 つを 1 つのボタンに見せる .panel-split-button）。
 * メニューは 新しい子チャット ｜ 子チャット ▸（このチャットの子）・サブエージェント ▸（アーカイブしたものは除く）｜ ファイル・検索・変更・履歴（プロジェクトの左の列のタブと同じ画面。
 * 作業場所はこのチャットの作業場所から）｜ ノート ▸（最近変えた 12 件）・DB ▸（DB クライアントと、接続ごとの新しい SQL のタブ。この Mac のアプリの中だけ）・Docker・GitHub・CI（この Mac のアプリの中だけ）・ゴミ箱。
 * どれも設定の開き方によらず、この右の欄に開く（▸ の一覧が空なら押せない）。欄のチャットが子チャットを作れないとき（useNewChild）は出さない
 */
export function AgentPanelAdds({ panel, pane }: { panel: PanelController; pane: PaneLeaf }) {
  const menu = useContextMenu({ align: "end" });
  const newChild = useNewChild(panel);
  if (!newChild) return null;
  const onNewChild = () => {
    panel.focusPane(pane.id);
    newChild();
  };
  return (
    <span className="panel-bar-buttons panel-tab-adds">
      <span className="panel-split-button">
        <IconButton icon={MessageSquarePlus} label="新しい子チャット" iconSize={14} onClick={onNewChild} />
        <IconButton
          icon={ChevronDown}
          label="右の欄に開く"
          title="新しい子チャット・子チャット・サブエージェント・ファイル・検索・変更・履歴・ノート・DB から選んで、右の欄に開く"
          iconSize={12}
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

/** 右の欄にタブがないときの案内（新しい子チャットを開けるときだけ、その文とボタンを足す） */
export function AgentPanelEmpty({ panel, pane, hint }: { panel: PanelController; pane: PaneLeaf; hint: string | undefined }) {
  const newChild = useNewChild(panel);
  return (
    <>
      {hint && <p className="muted small">{newChild ? `${hint}「＋」で新しい子チャットを始められます。` : hint}</p>}
      {newChild && (
        <button
          className="btn"
          onClick={() => {
            panel.focusPane(pane.id);
            newChild();
          }}
        >
          <MessageSquarePlus size={14} /> 新しい子チャット
        </button>
      )}
    </>
  );
}

/** メニューの中身（開いている間だけ描くので、一覧はこのときだけ読む） */
function AgentPanelAddItems({ panel, onNewChild }: { panel: PanelController; onNewChild: () => void }) {
  const at = parsePanelKey(panel.key);
  const chatId = at && typeof at.scope === "number" ? at.scope : 0;
  const chat = useKnownChat(chatId);
  const subagentNav = useOptionalSubagentNav();
  // チャットの店の取り出し口を直接読む（会話の欄が配る context は、右の欄の外にある）
  const { tree } = chatSubagents.useFor(chatId);
  const [archivedKeys] = useSetting(subagentsSettings.archived(chatId));
  const children = (useChildChats().get(chatId) ?? []).filter((c) => c.archived_at === null);
  // サブエージェントは入れ子を親のすぐ下に（入力欄の上の一覧と同じ並び）。アーカイブしたものは出さない
  const subagents = flattenTree(tree).filter(({ entry }) => !archivedKeys.includes(entry.key));
  if (!chat) return null;
  const worktree = chat.worktree_path ?? undefined;
  // 欄に 1 つだけ開くもの（GitHub・CI・Docker・ゴミ箱）の開く先
  const target = { chatId: chat.id, projectId: chat.project_id };
  /** プロジェクトの「ファイル」「検索」「履歴」タブと同じ画面を、この右の欄に開く項目 */
  const projectView = (view: ProjectView) => {
    const Icon = PROJECT_VIEW_ICONS[view];
    return (
      <MenuItem
        title={`プロジェクトの「${PROJECT_VIEW_LABELS[view]}」タブと同じ画面を開く（このチャットの作業場所から）`}
        onSelect={() => openTab(panel.key, projectViewTab({ chatId: chat.id, projectId: chat.project_id, view, ...(worktree ? { worktree } : {}) }))}
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
      <SubmenuItem icon={MessagesSquare} label="子チャット" empty={children.length === 0 ? "子チャットはありません" : null}>
        {children.map((c) => (
          <MenuItem key={c.id} title={chatTitle(c.title)} onSelect={() => openChat(c, "side")}>
            {chatTitle(c.title)}
          </MenuItem>
        ))}
      </SubmenuItem>
      {subagentNav && (
        <SubmenuItem icon={Bot} label="サブエージェント" empty={subagents.length === 0 ? "サブエージェントはいません" : null}>
          {subagents.map(({ entry, depth }) => (
            <MenuItem
              key={entry.key}
              title={entry.description}
              buttonProps={depth > 0 ? { style: { paddingLeft: `calc(10px + ${Math.min(depth, 4)} * 12px)` } } : undefined}
              onSelect={() => subagentNav.openSide(entry.key)}
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
        onSelect={() => openTab(panel.key, changesTab({ chatId: chat.id, projectId: chat.project_id, ...(worktree ? { worktree } : {}) }))}
      >
        <FileDiff size={14} /> 変更
      </MenuItem>
      {projectView("history")}
      <div className="menu-separator" role="separator" />
      <SubmenuItem icon={StickyNote} label="ノート" empty={null}>
        <RecentNoteItems projectId={chat.project_id} onPick={(path) => openTab(panel.key, noteTab({ chatId: chat.id, projectId: chat.project_id, path }))} />
      </SubmenuItem>
      {/* DB はこの Mac のアプリの中だけ（API が 127.0.0.1 からだけ受ける） */}
      {window.kickoff && (
        <SubmenuItem icon={Database} label="DB" empty={null}>
          <DbMenuItems
            projectId={chat.project_id}
            place={`chat-${chat.id}`}
            onOpen={() => openTab(panel.key, databaseTab({ chatId: chat.id, projectId: chat.project_id, ...(worktree ? { worktree } : {}) }))}
          />
        </SubmenuItem>
      )}
      {/* Docker・GitHub・CI もこの Mac のアプリの中だけ（API が 127.0.0.1 からだけ受ける。プロジェクトのタブと同じ）。並びはプロジェクトのタブの初めの並び */}
      {window.kickoff && (
        <>
          <MenuItem title="プロジェクトの「Docker」タブと同じ画面（compose のサービス）を開く" onSelect={() => openTab(panel.key, projectToolTab("docker", target))}>
            <Container size={14} /> Docker
          </MenuItem>
          <MenuItem title="プロジェクトの「GitHub」タブと同じ画面（issue・PR の一覧と中身）を開く" onSelect={() => openTab(panel.key, githubTab(target))}>
            <GitPullRequest size={14} /> GitHub
          </MenuItem>
          <MenuItem title="プロジェクトの「CI」タブと同じ画面（GitHub Actions の実行の一覧とログ）を開く" onSelect={() => openTab(panel.key, projectToolTab("ci", target))}>
            <Workflow size={14} /> CI
          </MenuItem>
        </>
      )}
      <MenuItem title="プロジェクトの「ゴミ箱」タブと同じ画面（消したものを 3 日取っておき、元に戻せる）を開く" onSelect={() => openTab(panel.key, projectToolTab("trash", target))}>
        <Trash2 size={14} /> ゴミ箱
      </MenuItem>
    </>
  );
}

/** 横に一覧を開く項目（一覧が空なら押せない項目にして、理由を説明に出す） */
function SubmenuItem({
  icon: Icon,
  label,
  empty,
  children,
}: {
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
    <MenuSub icon={<Icon size={14} />} label={label} menuLabel={label}>
      {children}
    </MenuSub>
  );
}
