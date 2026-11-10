import { childDepthLabel, childDepthShort } from "@shared/chat/childDepth";
import type { Chat } from "@shared/types";
import { chatTitle } from "@/features/chat/chatTitle";
import { knownChat, useChatsValue } from "@/stores/chats";
import { ancestorsOf } from "./childChats";

/** 子チャットの深さ（1 = 子・2 = 孫・3 = ひ孫）。親が読み込んだ一覧になければ子とみなす */
export function useChildDepth(chat: Pick<Chat, "id" | "parent_chat_id"> | undefined): number {
  return Math.max(useChatsValue(() => (chat ? ancestorsOf(chat, knownChat).length : 0)) ?? 0, 1);
}

/**
 * 親の行の外に並ぶ子チャットの行の、名前の前の深さの札（「子」「孫」「ひ孫」。色は右の欄の子チャットのタブの札と同じ深さの色 --child-depth-<n>）。
 * サイドバーで状態・要対応で絞り込んだときや ⌘⇧A のように、子チャットが親の中でなく 1 行で並ぶ所で、子チャットだと分かるように置く（利用者の依頼）。
 * 乗せると「「親の名前」の子チャット」
 */
export function ChildDepthMark({ chat }: { chat: Pick<Chat, "id" | "parent_chat_id"> }) {
  const depth = useChildDepth(chat);
  const parentTitle = useChatsValue(() => {
    const parent = chat.parent_chat_id !== null ? knownChat(chat.parent_chat_id) : undefined;
    return parent ? chatTitle(parent.title) : "";
  });
  const label = childDepthLabel(depth);
  return (
    <span className={`child-depth-badge child-depth-mark-${Math.min(depth, 3)}`} data-tip={parentTitle ? `「${parentTitle}」の${label}` : label}>
      {childDepthShort(depth)}
    </span>
  );
}
