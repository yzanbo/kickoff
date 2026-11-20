import { Archive, ArchiveRestore, ChevronRight, Copy, Folder, FolderInput, GitBranch, Image as ImageIcon, Mail, MailOpen, MessageSquarePlus, PanelRight, Pencil, Pin, Trash2, Unlink } from "lucide-react";
import type { ReactNode } from "react";
import type { Chat } from "@shared/chat/types";
import { api } from "@/foundation/ui/api";
import { errorMessage } from "@shared/foundation/errors";
import { confirmDeleteChat, confirmMoveChatToProject, toggleArchiveChat, togglePinChat } from "@/features/chat/ui/chatActions";
import { openNewProject } from "@/features/projects/ui/new/openNewProject";
import { MenuItem } from "@/foundation/ui/kit/PopupMenu";
import { useSubmenu } from "@/foundation/ui/kit/MenuFlyout";
import { ProjectPickFlyout } from "@/features/projects/ui/ProjectPickFlyout";
import { WorkplacePickFlyout } from "@/features/workplaceMove/ui/WorkplacePickFlyout";
import { workplaceMoveBlock } from "@/features/workplaceMove/ui/moveWorkplace";
import { useWorktrees } from "@/foundation/ui/workplace/worktreesStore";
import { GroupPickFlyout } from "@/features/groups/ui/GroupPickFlyout";
import { askNewGroupName } from "@/features/groups/ui/groups";
import { openAskChild } from "@/features/chat/ui/open/openChat";
import { DetachSubmenu } from "@/features/childChats/ui/DetachSubmenu";
import { manageImageHosts } from "@/features/remoteImages/ui/manageImageHosts";
import { openNewChat } from "@/foundation/ui/navigation/router";
import { NewChatItem, type NewChatPlace } from "@/features/chat/ui/open/NewChatItem";

/** 新しいチャットの既定の開き方（そのプロジェクトのチャットのパネルで、同じグループ・作業場所） */
const openNewChatAt = (place: NewChatPlace) => openNewChat(place.projectId, { group: place.group, worktree: place.worktree });

/**
 * チャットの右クリックのメニューの項目（サイドバーの行・ボードのカード・パネルのチャットのタブで共通。どこで右クリックしても同じ並びにする）:
 * 新しいチャット（同じグループ・作業場所。NewChatItem）・子チャットを作成 ｜ 開く・その場所だけの項目（before。分けて開く・動きを見るなど）｜
 * 整理 = 名前を変更・既読 / 未読・固定 ｜ 移す = 親から外す（子チャット）/ グループを変更（親のないチャット）・作業場所を変更・プロジェクトを変更 ｜
 * その他 = セッション ID をコピー・画像の表示を許可したサイト・GitHub との結び付きを外す ｜ しまう = アーカイブ・削除 ｜ after（タブの表示・タブを閉じるなど）。
 * あまり使わないもの（その他・しまう）は下へ寄せる。
 * 「グループを変更」「プロジェクトを変更」に乗せる・押すと、横にグループ・プロジェクトの一覧（GroupPickFlyout / ProjectPickFlyout）を開く
 */
export function ChatMenuItems({
  chat,
  onOpen,
  onNewChat = openNewChatAt,
  onRename,
  onClose,
  onError,
  before,
  after,
}: {
  chat: Chat;
  /** 開く（サイドバー・ボードだけ。タブはもう開いているので渡さない） */
  onOpen?: (chat: Chat) => void;
  /** 同じグループ・作業場所で新しいチャットを始める（既定はそのプロジェクトのチャットのパネルで。タブは右クリックしたタブのペインで） */
  onNewChat?: (place: NewChatPlace) => void;
  /** 名前をその場で変え始める */
  onRename: (chat: Chat) => void;
  onClose: () => void;
  onError: (message: string) => void;
  before?: ReactNode;
  after?: ReactNode;
}) {
  // 「グループを変更」「プロジェクトを変更」の横に開く一覧
  const grouping = useSubmenu();
  const moving = useSubmenu();
  const relocating = useSubmenu();
  // 作業場所を変更（ワークツリーの一覧がある = Git のプロジェクトだけ。作業中・実行環境を整えるチャットは押せない）
  const canRelocate = (useWorktrees(chat.project_id)?.length ?? 0) > 0;
  const relocateBlock = workplaceMoveBlock(chat);
  // 新しいグループの名前を聞いて作り、このチャットをそこへ移す
  const createGroupAndMove = async () => {
    const name = await askNewGroupName("作成して移す");
    if (!name) return;
    const group = await api.createGroup(chat.project_id, name);
    await api.setChatGroup(chat.id, group.id);
  };
  // 失敗はお知らせで出す（メニューは閉じる）
  const act = (fn: () => Promise<unknown>) => {
    onClose();
    void fn().catch((e: unknown) => onError(errorMessage(e)));
  };
  // 新しいチャットは、このチャットと同じグループ・作業場所で始める（ノートのチャットは一覧に出ないので出さない）
  const place: NewChatPlace = { projectId: chat.project_id, group: chat.group_id ?? undefined, worktree: chat.worktree_path ?? undefined };
  const canNew = chat.note_path === null;
  const canChild = !chat.archived_at;
  return (
    <div className="menu-items">
      {canNew && <NewChatItem place={place} branch={chat.branch} onSelect={() => onNewChat(place)} />}
      {/* このチャットの子チャットを始める（発言の右クリックと同じく、右の欄の新しい子チャットのタブを開く。引用はなし。アーカイブしたチャットからは始めない） */}
      {canChild && (
        <MenuItem
          onSelect={() => {
            onClose();
            openAskChild({ parentId: chat.id, eventId: null, quote: "" });
          }}
        >
          <MessageSquarePlus size={14} /> 子チャットを作成…
        </MenuItem>
      )}
      {(canNew || canChild) && <div className="menu-separator" role="separator" />}
      {onOpen && (
        <MenuItem onSelect={() => onOpen(chat)}>
          <PanelRight size={14} /> 開く
        </MenuItem>
      )}
      {before}
      {(onOpen || before) && <div className="menu-separator" role="separator" />}
      <MenuItem onSelect={() => onRename(chat)}>
        <Pencil size={14} /> 名前を変更
      </MenuItem>
      {/* 未読の印（サイドバーで太字になる。次に開くまで残る） */}
      {chat.unread ? (
        <MenuItem onSelect={() => act(() => api.markSeen(chat.id))}>
          <MailOpen size={14} /> 既読にする
        </MenuItem>
      ) : (
        <MenuItem onSelect={() => act(() => api.markUnseen(chat.id))}>
          <Mail size={14} /> 未読にする
        </MenuItem>
      )}
      {/* 固定はサイドバーの「固定」のまとまりに出す（アーカイブしたものは固定しない。言葉はまとまりの見出しと同じ「固定」） */}
      {!chat.archived_at && (
        <MenuItem onSelect={() => act(() => togglePinChat(chat))}>
          <Pin size={14} /> {chat.pinned ? "固定を外す" : "固定"}
        </MenuItem>
      )}
      {/* 移す組（親・グループ・作業場所・プロジェクト。どれも横に一覧を開く） */}
      <div className="menu-separator" role="separator" />
      {/* 子チャットは「親から外す ▸」（親のないチャットにする・先祖の子に上げる。確かめてから。グループの代わりにここに置く） */}
      {chat.parent_chat_id !== null && <DetachSubmenu chat={chat} onClose={onClose} onError={onError} />}
      {/* 乗せる・押す・→ で横にこのプロジェクトのグループの一覧を開く（メニューは閉じない。子チャットはグループに入らないので出さない） */}
      {chat.parent_chat_id === null && (
        <button {...grouping.trigger}>
          <Folder size={14} /> グループを変更
          <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
        </button>
      )}
      {grouping.anchor && (
        <GroupPickFlyout
          anchor={grouping.anchor}
          projectId={chat.project_id}
          current={chat.group_id}
          onPick={(group) => act(() => api.setChatGroup(chat.id, group?.id ?? null))}
          onCreate={() => act(createGroupAndMove)}
          onBack={grouping.back}
        />
      )}
      {/* 乗せる・押す・→ で横に移す先の作業場所の一覧を開く（「プロジェクトを変更」の隣。子チャットは移らない） */}
      {canRelocate && (
        <button {...relocating.trigger} disabled={relocateBlock !== null} data-tip={relocateBlock ?? undefined}>
          <GitBranch size={14} /> 作業場所を変更
          <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
        </button>
      )}
      {relocating.anchor && <WorkplacePickFlyout anchor={relocating.anchor} chat={chat} onDone={onClose} onBack={relocating.back} />}
      {/* 乗せる・押す・→ で横にプロジェクトの一覧を開く（メニューは閉じない） */}
      <button {...moving.trigger}>
        <FolderInput size={14} /> プロジェクトを変更
        <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
      </button>
      {moving.anchor && (
        <ProjectPickFlyout
          anchor={moving.anchor}
          current={chat.project_id}
          onPick={(project) => act(() => confirmMoveChatToProject(chat, project))}
          onCreate={(name) => {
            onClose();
            // 作ったら、そのプロジェクトへこのチャットを移す（確かめてから）
            openNewProject({ name, after: { kind: "moveChat", chatId: chat.id } });
          }}
          onBack={moving.back}
        />
      )}
      {/* その他の組（あまり使わないので、しまう組のすぐ上に寄せる） */}
      <div className="menu-separator" role="separator" />
      {/* Claude Code で同じ会話を続けるとき（claude --resume <ID>）などに使う */}
      {chat.session_id && (
        <MenuItem onSelect={() => act(() => navigator.clipboard.writeText(chat.session_id ?? ""))}>
          <Copy size={14} /> セッション ID をコピー
        </MenuItem>
      )}
      {/* 返答の外の画像で、押さずに出すようにしたサイト（このチャットだけ。外せる） */}
      <MenuItem onSelect={() => act(() => manageImageHosts(chat.id))}>
        <ImageIcon size={14} /> 画像の表示を許可したサイト…
      </MenuItem>
      {/* GitHub の issue・PR との結び付き（GitHub タブの「AI に渡す」で付く。外すと PR を作るときの「Closes #n」・札・一覧の印からも外れる） */}
      {chat.github_number !== null && (
        <MenuItem onSelect={() => act(() => api.clearChatGitHub(chat.id))}>
          <Unlink size={14} /> GitHub #{chat.github_number} との結び付きを外す
        </MenuItem>
      )}
      <div className="menu-separator" role="separator" />
      <MenuItem onSelect={() => act(() => toggleArchiveChat(chat))}>
        {chat.archived_at ? <ArchiveRestore size={14} /> : <Archive size={14} />} {chat.archived_at ? "アーカイブから戻す" : "アーカイブ"}
      </MenuItem>
      <MenuItem danger onSelect={() => act(() => confirmDeleteChat(chat))}>
        <Trash2 size={14} /> 削除…
      </MenuItem>
      {after}
    </div>
  );
}
