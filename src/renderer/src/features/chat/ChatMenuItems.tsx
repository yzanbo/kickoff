import { Archive, ArchiveRestore, ChevronRight, Copy, Folder, FolderInput, Mail, MailOpen, MessageSquarePlus, PanelRight, Pencil, Pin, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { Chat } from "@shared/types";
import { api } from "@/api";
import { errorMessage } from "@shared/errors";
import { confirmDeleteChat, confirmMoveChatToProject, toggleArchiveChat, togglePinChat } from "./chatActions";
import { openNewProject } from "@/features/project/new/openNewProject";
import { MenuItem } from "@/ui/PopupMenu";
import { useSubmenu } from "@/ui/MenuFlyout";
import { ProjectPickFlyout } from "@/features/project/ProjectPickFlyout";
import { GroupPickFlyout } from "@/features/group/GroupPickFlyout";
import { askNewGroupName } from "@/features/group/groups";
import { openAskChild } from "./children/childChats";
import { openNewChat } from "@/app/router";
import { NewChatItem, type NewChatPlace } from "./NewChatItem";

/**
 * チャットの右クリックのメニューの項目（サイドバーの行・ボードのカード・パネルのチャットのタブで共通。どこで右クリックしても同じ並びにする）:
 * 新しいチャット（同じグループ・作業場所。NewChatItem）・子チャットを作成 ｜ 開く・その場所だけの項目（before。分けて開く・動きを見るなど）｜
 * 名前を変更・既読 / 未読・固定・セッション ID をコピー・グループを変更・プロジェクトを変更 ｜ アーカイブ・削除 ｜ after（タブを閉じるなど）。
 * 「グループを変更」「プロジェクトを変更」に乗せる・押すと、横にグループ・プロジェクトの一覧（GroupPickFlyout / ProjectPickFlyout）を開く
 */
export function ChatMenuItems({
  chat,
  onOpen,
  onNewChat = (place) => openNewChat(place.projectId, { group: place.group, worktree: place.worktree }),
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
  // 新しいチャットは、このチャットと同じグループ・作業場所で始める（メモのチャットは一覧に出ないので出さない）
  const place: NewChatPlace = { projectId: chat.project_id, group: chat.group_id ?? undefined, worktree: chat.worktree_path ?? undefined };
  const canNew = chat.memo_path === null;
  const canChild = !chat.archived_at;
  return (
    <div className="menu-items">
      {canNew && <NewChatItem place={place} branch={chat.branch} onSelect={() => onNewChat(place)} />}
      {/* このチャットの子チャットを始める（発言の右クリックと同じ聞く画面。引用はなし。アーカイブしたチャットからは始めない） */}
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
      {/* 固定はサイドバーの、プロジェクトのいちばん上のまとまりに出す（アーカイブしたものは固定しない） */}
      {!chat.archived_at && (
        <MenuItem onSelect={() => act(() => togglePinChat(chat))}>
          <Pin size={14} /> {chat.pinned ? "ピン留めを外す" : "ピン留め"}
        </MenuItem>
      )}
      {/* Claude Code で同じ会話を続けるとき（claude --resume <ID>）などに使う */}
      {chat.session_id && (
        <MenuItem onSelect={() => act(() => navigator.clipboard.writeText(chat.session_id ?? ""))}>
          <Copy size={14} /> セッション ID をコピー
        </MenuItem>
      )}
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
            openNewProject({ name, onCreated: (project) => void confirmMoveChatToProject(chat, project).catch((e: unknown) => onError(errorMessage(e))) });
          }}
          onBack={moving.back}
        />
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
