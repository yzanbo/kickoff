import { Archive, ArchiveRestore, ChevronRight, Copy, FolderInput, Mail, MailOpen, PanelRight, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { Chat } from "@shared/types";
import { api } from "@/api";
import { chatTitle } from "./chatTitle";
import { confirmDialog } from "@/ui/dialogs";
import { errorMessage } from "@shared/errors";
import { openChat, useRoute } from "@/app/router";
import { confirmDeleteChat, toggleArchiveChat, togglePinChat } from "./chatActions";
import { openNewProject } from "@/features/project/new/openNewProject";
import { MenuItem } from "@/ui/PopupMenu";
import { useSubmenu } from "@/ui/MenuFlyout";
import { ProjectPickFlyout } from "@/features/project/ProjectPickFlyout";

/**
 * チャットの右クリックのメニューの項目（サイドバーの行・ボードのカード・パネルのチャットのタブで共通）:
 * 開く・名前を変更・既読 / 未読・固定・セッション ID をコピー・プロジェクトを変更・アーカイブ・削除。
 * before / after: その場所だけの項目（タブの分割・閉じるなど）。「プロジェクトを変更」に乗せる・押すと、横にプロジェクトの一覧（ProjectPickFlyout）を開く
 */
export function ChatMenuItems({
  chat,
  onOpen,
  onRename,
  onClose,
  onError,
  before,
  after,
}: {
  chat: Chat;
  /** 開く（サイドバー・ボードだけ。タブはもう開いているので渡さない） */
  onOpen?: (chat: Chat) => void;
  /** 名前をその場で変え始める */
  onRename: (chat: Chat) => void;
  onClose: () => void;
  onError: (message: string) => void;
  before?: ReactNode;
  after?: ReactNode;
}) {
  // 「プロジェクトを変更」の横に開く一覧
  const moving = useSubmenu();
  const route = useRoute();
  // いま開いているチャットを移したら、移した先のプロジェクトで開き直す（元のボードからは消えるため）
  const viewing = route.name === "chat" && route.chatId === chat.id;
  // 失敗はお知らせで出す（メニューは閉じる）
  const act = (fn: () => Promise<unknown>) => {
    onClose();
    void fn().catch((e: unknown) => onError(errorMessage(e)));
  };
  return (
    <div className="menu-items" onMouseOver={moving.onMenuHover}>
      {before}
      {onOpen && (
        <MenuItem onSelect={() => onOpen(chat)}>
          <PanelRight size={14} /> 開く
        </MenuItem>
      )}
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
          {chat.pinned ? <PinOff size={14} /> : <Pin size={14} />} {chat.pinned ? "ピン留めを外す" : "ピン留め"}
        </MenuItem>
      )}
      {/* Claude Code で同じ会話を続けるとき（claude --resume <ID>）などに使う */}
      {chat.session_id && (
        <MenuItem onSelect={() => act(() => navigator.clipboard.writeText(chat.session_id ?? ""))}>
          <Copy size={14} /> セッション ID をコピー
        </MenuItem>
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
          onPick={(project) => act(() => moveChat(chat, project, viewing))}
          onCreate={(name) => {
            onClose();
            // 作ったら、そのプロジェクトへこのチャットを移す（確かめてから）
            openNewProject({ name, onCreated: (project) => void moveChat(chat, project, viewing).catch((e: unknown) => onError(errorMessage(e))) });
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

/** 移す前に確かめる（作業フォルダが変わる。グループ・作業場所（ワークツリー）は外れる）。follow: 移したあと、移した先でそのチャットを開く */
async function moveChat(chat: Chat, project: { id: number; name: string }, follow: boolean): Promise<void> {
  const lost = [chat.group_id !== null && "グループ", chat.worktree_path && "作業場所（ワークツリー）"].filter(Boolean).join("・");
  const ok = await confirmDialog({
    title: `チャット「${chatTitle(chat.title)}」を「${project.name}」へ移しますか？`,
    message: `これからの作業は、移した先のプロジェクトのフォルダ（本体）で行います。会話はそのまま続けられます。${lost ? `いまの${lost}は外れます。` : ""}`,
    confirmLabel: "移動する",
  });
  if (!ok) return;
  await api.moveChat(chat.id, project.id);
  if (follow) openChat(project.id, chat.id);
}
