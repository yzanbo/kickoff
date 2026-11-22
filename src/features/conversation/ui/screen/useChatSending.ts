// 1 つのチャットの選択・作業中の様子・送り方（会話の欄と、別ウィンドウのサブエージェントの画面の書き直し・送り直しで使う）
import { useEffect, useMemo, useState } from "react";
import type { ChatLive } from "@shared/chat/chatLive";
import type { Chat } from "@shared/chat/types";
import { useChatDetail } from "@/features/chat/ui";
import { chatSubagents } from "@/features/subagents/ui";
import { useChatOptions } from "@/features/ai/ui";
import { compactHoldOf } from "@/features/compact/ui";
import { useChatSend } from "@/features/composer/ui";
import type { TimelineScroll } from "@/features/conversation/ui/timeline/timelineScroll";

export function useChatSending(chat: Chat, scroll: TimelineScroll, beforeSend?: () => Promise<void>) {
  const { live: coreLive } = useChatDetail(chat.id);
  const options = useChatOptions(
    { model: chat.model, effort: chat.effort, permission_mode: chat.permission_mode, fast_mode: chat.fast_mode },
    chat.project_id,
    chat.worktree_path ?? undefined,
    chat.provider,
  );
  const busy = chat.status === "running";
  // 停止を押して、止まるのを待っている（押してからコアの知らせが届くまでの間も含める。止まったら戻す）
  const [stopClicked, setStopClicked] = useState(false);
  useEffect(() => {
    if (!busy) setStopClicked(false);
  }, [busy]);
  // 画面に出す作業中の様子: 停止中は押した直後から、会話の圧縮中・圧縮前指示から圧縮が終わるまでは作業中だけ（作業中の行・チャット欄のメーターで知らせる）
  const live = useMemo<ChatLive>(
    () => ({
      ...coreLive,
      stopping: busy && (stopClicked || coreLive.stopping),
      compacting: busy ? coreLive.compacting : null,
      awaiting_compact: busy && coreLive.awaiting_compact,
      compact_after_turn: busy && coreLive.compact_after_turn,
      compacted_turn: busy && coreLive.compacted_turn,
      tells_closed: busy && coreLive.tells_closed,
      inheriting: busy && coreLive.inheriting,
    }),
    [coreLive, busy, stopClicked],
  );
  // 動いているサブエージェント（作業を止めると一緒に止まる。Claude Code は手前で動かすサブエージェントを裏の作業の一覧に出さないので、一覧の行から数える）
  const runningAgents = chatSubagents.useWith(chat.id, (v) => v.entries.filter((s) => s.status === "running").length);
  const send = useChatSend({
    chatId: chat.id,
    busy,
    queued: live.queue.messages.length > 0,
    compactHold: compactHoldOf(live),
    options,
    scroll,
    background: live.background,
    runningAgents,
    onStopping: setStopClicked,
    beforeSend,
  });
  return { options, busy, live, send };
}
