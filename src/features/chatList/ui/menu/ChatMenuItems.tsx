import { Archive, ArchiveRestore, Copy, Image as ImageIcon, MessageSquarePlus, PanelRight, Pencil, Pin, Trash2, Unlink } from "lucide-react";
import type { ReactNode } from "react";
import type { Chat } from "@shared/chat/types";
import { errorMessage } from "@shared/foundation/errors";
import { MenuItem } from "@/foundation/ui/kit/PopupMenu";
import { open as openTarget } from "@/foundation/ui/navigation/open";
import { confirmArchiveChats, confirmDeleteChats, confirmMoveChatToProject, NewChatItem, openAskChild, ReadToggleItem, togglePinChat, type NewChatPlace, chatsApi } from "@/features/chat/ui";
import { openNewProject } from "@/features/projects/ui";
import { DetachSubmenu } from "@/features/childChats/ui";
import { manageImageHosts } from "@/features/remoteImages/ui";
import { WorkplaceMoveItem } from "@/features/workplaceMove/ui";
import { askNewGroup, MoveToGroupItem, MoveToProjectItem } from "./MoveItems";

/** 新しいチャットの既定の開き方（そのプロジェクトのチャットのパネルで、同じグループ・作業場所） */
const openNewChatAt = (place: NewChatPlace) => openTarget({ kind: "newChat", projectId: place.projectId, groupId: place.group, worktree: place.worktree });

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
  // 新しいグループの名前を聞いて作り、このチャットをそこへ移す
  const createGroupAndMove = async () => {
    const group = await askNewGroup(chat.project_id);
    if (group) await chatsApi.setChatGroup(chat.id, group.id);
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
      {/* 未読の印（サイドバーで太字になる。次に開くまで残る。作業中・回答待ちは押せない） */}
      <ReadToggleItem chat={chat} onError={onError} />
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
        <MoveToGroupItem
          projectId={chat.project_id}
          current={chat.group_id}
          onPick={(group) => act(() => chatsApi.setChatGroup(chat.id, group?.id ?? null))}
          onCreate={() => act(createGroupAndMove)}
        />
      )}
      {/* 乗せる・押す・→ で横に移す先の作業場所の一覧を開く（「プロジェクトを変更」の隣。子チャットは移らない） */}
      <WorkplaceMoveItem chat={chat} onDone={onClose} />
      {/* 乗せる・押す・→ で横にプロジェクトの一覧を開く（メニューは閉じない） */}
      <MoveToProjectItem
        current={chat.project_id}
        onPick={(project) => act(() => confirmMoveChatToProject(chat, project))}
        onCreate={(name) => {
          onClose();
          // 作ったら、そのプロジェクトへこのチャットを移す（確かめてから）
          openNewProject({ name, after: { kind: "moveChat", chatId: chat.id } });
        }}
      />
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
        <MenuItem onSelect={() => act(() => chatsApi.clearChatGitHub(chat.id))}>
          <Unlink size={14} /> GitHub #{chat.github_number} との結び付きを外す
        </MenuItem>
      )}
      <div className="menu-separator" role="separator" />
      <MenuItem onSelect={() => act(() => confirmArchiveChats(chat))}>
        {chat.archived_at ? <ArchiveRestore size={14} /> : <Archive size={14} />} {chat.archived_at ? "アーカイブから戻す" : "アーカイブ"}
      </MenuItem>
      <MenuItem danger onSelect={() => act(() => confirmDeleteChats(chat))}>
        <Trash2 size={14} /> 削除…
      </MenuItem>
      {after}
    </div>
  );
}
