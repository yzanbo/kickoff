import { ChevronDown, ChevronRight, SquarePen, Wrench } from "lucide-react";
import type { Chat, GitHubIssueDetail, GitHubPullDetail } from "@shared/types";
import { useChats, useKnownChat } from "@/stores/chats";
import { AddToChat } from "@/ui/icons";
import { MenuFlyout, useSubmenu } from "@/ui/MenuFlyout";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { chatTitle } from "@/features/chat/chatTitle";
import { useMainChat } from "@/features/chat/pane/mainChatContext";
import { addToChatWith, fixReviewComments, startChatWith } from "./githubHandoff";
import { itemPrompt, linkOf } from "./githubPrompt";

/** 「チャットに追加 ▸」に並べるチャットの数（最近動いた順） */
const CHAT_CHOICES = 15;

const isPull = (d: GitHubIssueDetail): d is GitHubPullDetail => d.item.kind === "pr";

/**
 * 中身の見出しの「AI に渡す ▾」: 新しいチャットで始める（作業場所を選ぶ）・チャットに追加（右の欄ではその欄のチャット、
 * プロジェクトのタブでは最近動いたチャットから選ぶ）・PR はレビューコメントで直す（解決していない行のコメント）。
 * どれも文を入力欄に入れるだけで、送るのは自分で
 */
export function GitHubHandoffMenu({ projectId, detail }: { projectId: number; detail: GitHubIssueDetail | GitHubPullDetail }) {
  const menu = useContextMenu({ align: "end" });
  return (
    <>
      <button
        type="button"
        className="btn btn-sm github-handoff-button"
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        data-tip="この issue・PR をチャットの入力欄に入れる（送るのは自分で）"
        onClick={(e) => menu.toggle(e)}
      >
        AI に渡す <ChevronDown size={12} aria-hidden />
      </button>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="AI に渡す" ignore=".github-handoff-button" onClose={menu.close}>
          <HandoffItems projectId={projectId} detail={detail} />
        </PopupMenu>
      )}
    </>
  );
}

/** メニューの中身（開いている間だけ描くので、チャットの一覧はこのときだけ読む） */
function HandoffItems({ projectId, detail }: { projectId: number; detail: GitHubIssueDetail | GitHubPullDetail }) {
  const link = linkOf(detail);
  const mainChatId = useMainChat();
  const mainChat = useKnownChat(mainChatId ?? 0);
  const { chats } = useChats({ projectId, enabled: mainChatId === null });
  const chatMenu = useSubmenu();
  const unresolved = isPull(detail) ? detail.review_threads.filter((t) => !t.resolved).length : 0;
  const add = (chat: Chat) => addToChatWith(chat, itemPrompt(detail), link);

  return (
    <>
      <MenuItem title="作業場所（新しいワークツリー・本体・いまあるワークツリー）を選んで、題名・本文・コメントを入れた新しいチャットを開く" onSelect={() => void startChatWith(projectId, itemPrompt(detail), link)}>
        <SquarePen size={14} /> 新しいチャットで始める
      </MenuItem>
      {/* 右の欄ではその欄のチャットへ。プロジェクトのタブでは最近動いたチャットから選ぶ */}
      {mainChat ? (
        <MenuItem title={`題名・本文・コメントを「${chatTitle(mainChat.title)}」の入力欄に足す`} onSelect={() => add(mainChat)}>
          <AddToChat size={14} /> 「{chatTitle(mainChat.title)}」に追加
        </MenuItem>
      ) : chats.length === 0 ? (
        <MenuItem disabled title="このプロジェクトにチャットがありません" onSelect={() => {}}>
          <AddToChat size={14} /> チャットに追加
        </MenuItem>
      ) : (
        <>
          <button {...chatMenu.trigger}>
            <AddToChat size={14} /> チャットに追加
            <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
          </button>
          {chatMenu.anchor && (
            <MenuFlyout anchor={chatMenu.anchor} label="チャットに追加" onBack={chatMenu.back}>
              {chats.slice(0, CHAT_CHOICES).map((c) => (
                <MenuItem key={c.id} title={`題名・本文・コメントを「${chatTitle(c.title)}」の入力欄に足して開く`} onSelect={() => add(c)}>
                  {chatTitle(c.title)}
                </MenuItem>
              ))}
            </MenuFlyout>
          )}
        </>
      )}
      {isPull(detail) && (
        <>
          <div className="menu-separator" role="separator" />
          <MenuItem
            disabled={unresolved === 0}
            title={
              unresolved === 0
                ? "解決していない行のコメントはありません"
                : "PR のブランチのワークツリー（なければ作る）で作業しているチャットの入力欄に、解決していない行のコメントを入れる（チャットがなければ新しく始める）"
            }
            onSelect={() => void fixReviewComments(projectId, detail, link)}
          >
            <Wrench size={14} /> レビューコメントで直す{unresolved > 0 ? `（${unresolved}）` : ""}
          </MenuItem>
        </>
      )}
    </>
  );
}
