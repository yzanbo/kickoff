// 1 つのチャットの選択・作業中の様子・送り方（会話の欄と、別ウィンドウのサブエージェントの画面の書き直し・送り直しで使う）
import { useEffect } from "react";
import type { Chat } from "@shared/chat/types";
import { chatSubagents } from "@/features/subagents/ui";
import { useChatOptions } from "@/features/ai/ui";
import { compactHoldOf, HOLD_TEXTS } from "@/features/compact/ui";
import { handBackFromOf } from "@/features/childChats/ui";
import { confirmStopAgents } from "@/features/conversation/ui/background/backgroundLabel";
import { useChatSend } from "@/features/composer/ui";
import type { TimelineScroll } from "@/features/conversation/ui/timeline/timelineScroll";
import { setStopPressed, useScreenLive } from "@/features/conversation/ui/working/screenLive";

/** コアが「いま」を預かる間の案内（圧縮前指示から圧縮のあとのやり取りが終わるまで） */
const holdTextsOf = (hold: ReturnType<typeof compactHoldOf>) => (hold ? HOLD_TEXTS[hold] : null);

export function useChatSending(chat: Chat, scroll: TimelineScroll, beforeSend?: () => Promise<void>) {
  const options = useChatOptions({
    initial: { model: chat.model, effort: chat.effort, permission_mode: chat.permission_mode, fast_mode: chat.fast_mode },
    projectId: chat.project_id,
    worktree: chat.worktree_path ?? undefined,
    provider: chat.provider,
  });
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
    holdTexts: holdTextsOf(compactHoldOf(live)),
    options,
    // 中断は、裏で動いているサブエージェント・コマンドも止まることを確かめてから
    confirmStop: () => confirmStopAgents(live.background, runningAgents, "中断する"),
    onStopping: (on) => setStopPressed(chat.id, on),
    beforeSend,
    // 送ったら一番下に付いていく
    afterSend: () => scroll.follow(),
    from: handBackFromOf(chat.id),
  });
  return { options, busy, live, send };
}
