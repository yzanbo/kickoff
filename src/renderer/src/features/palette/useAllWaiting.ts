import { useMemo } from "react";
import type { Chat } from "@shared/types";
import { useChatStates } from "@/app/chatStatesContext";
import { chatStateOf } from "@/features/chat/chatState";
import { waitingChats } from "@/features/chatList/chatListFlags";
import { useVisibleProjects } from "@/features/project/useVisibleProjects";
import { useSetting } from "@/hooks/useSetting";
import { ACTIVE_CHATS_SHOW_ARCHIVED_PROJECTS } from "@/lib/storageKeys";
import { useChatsWithChildren } from "@/stores/chats";

/** ボタンの右上に重ねる要対応の数（回答待ち・未読。urgent = 回答待ちがあるか。色を回答待ちのオレンジにする） */
export interface WaitingBadge {
  count: number;
  urgent: boolean;
}

/**
 * ⌘⇧A の一覧の「すべて」と同じプロジェクトのチャット（子チャットも。しまったプロジェクトは一覧の切り替えで出しているときだけ、タグで絞り込んでいれば合うものだけ）。
 * 要対応の数（useAllWaiting）と、プロジェクトの見出しの「すべてのプロジェクトの状態ごとのチャット」（AllStateChats）で同じ範囲にする
 */
export function useAllProjectChats(): Chat[] {
  const chats = useChatsWithChildren();
  const { visible, archived } = useVisibleProjects();
  const [showArchived] = useSetting(ACTIVE_CHATS_SHOW_ARCHIVED_PROJECTS);
  return useMemo(() => {
    const allowed = new Set((showArchived ? [...visible, ...archived] : visible).map((p) => p.id));
    return chats.filter((chat) => allowed.has(chat.project_id));
  }, [chats, visible, archived, showArchived]);
}

/**
 * すべてのプロジェクトの要対応（回答待ち・未読。サイドバーの「要対応」と同じ数え方。子チャットも数える）の数。
 * 数えるプロジェクトは ⌘⇧A の一覧の「すべて」と同じ（useAllProjectChats）。一覧を開いたときと同じ数になるようにする
 */
export function useAllWaiting(): WaitingBadge {
  const { pending } = useChatStates();
  const chats = useAllProjectChats();
  return useMemo(() => {
    const waiting = waitingChats(chats, pending);
    return { count: waiting.length, urgent: waiting.some((chat) => chatStateOf(chat, pending) === "needs_input") };
  }, [chats, pending]);
}
