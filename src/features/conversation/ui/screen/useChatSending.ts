// 1 つのチャットの選択・作業中の様子・送り方（会話の欄と、別ウィンドウのサブエージェントの画面の書き直し・送り直しで使う）
import { useEffect } from "react";
import type { Chat } from "@shared/chat/types";
import { chatSubagents } from "@/features/subagents/ui";
import { useChatOptions } from "@/features/ai/ui";
import { compactHoldOf } from "@/features/compact/ui";
import { useChatSend } from "@/features/composer/ui";
import type { TimelineScroll } from "@/features/conversation/ui/timeline/timelineScroll";
import { setStopPressed, useScreenLive } from "@/features/conversation/ui/working/screenLive";

export function useChatSending(chat: Chat, scroll: TimelineScroll, beforeSend?: () => Promise<void>) {
  const options = useChatOptions(
    { model: chat.model, effort: chat.effort, permission_mode: chat.permission_mode, fast_mode: chat.fast_mode },
    chat.project_id,
    chat.worktree_path ?? undefined,
    chat.provider,
  );
  const busy = chat.status === "running";
  // 画面に出す作業中の様子（コアの段階 phase と status は同じ知らせで届くので、作業中だけの欄を画面で隠さない。停止中だけは押した直後から）
  const live = useScreenLive(chat.id);
  // 止まったら、押した印を外す
  useEffect(() => {
    if (!busy) setStopPressed(chat.id, false);
  }, [busy, chat.id]);
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
    onStopping: (on) => setStopPressed(chat.id, on),
    beforeSend,
  });
  return { options, busy, live, send };
}
