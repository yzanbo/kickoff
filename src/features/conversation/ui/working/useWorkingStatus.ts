import type { ReactNode } from "react";
import type { ChatEvent } from "@shared/chat/chatEvent";
import type { ChatLive } from "@shared/chat/chatLive";
import type { Chat } from "@shared/chat/types";
import type { SubagentEntry } from "@shared/chat/subagents";
import { TICK_ACTIVITY, useTicker } from "@/foundation/ui/hooks/useTicker";
import type { TimelineItem } from "@/features/conversation/ui/timeline/timelineItems";
import { activityOf, latestOf, stalledAgents } from "@/features/chat/ui/state/stall";
import { workingLabel } from "./workingLabel";

/**
 * 作業中の行と、一番下へ戻るボタンに出すいまの状態の文（1 回だけ組み立てて、両方で使う。作業中でなければ null）。
 * 本当に動いているかの目安は、最後に何かが届いた時刻（記録・書いている途中の返答・サブエージェントの動き）。Claude Code に問い合わせる手段はないので、
 * 何も届かない間も動きの様子（「n 分動きがありません」）を進めるよう、作業中は定期的に描き直す（流れの各項目は memo しているので軽い）
 */
export function useWorkingStatus({
  chat,
  events,
  last,
  streaming,
  streamedAt: lastStreamedAt,
  live,
  agents,
  busy,
}: {
  chat: Chat;
  events: ChatEvent[];
  /** 流れ全体の最後の項目（窓で途中を描いていても、いまの状態で決める） */
  last: TimelineItem | undefined;
  /** 書いている途中の返答があるか */
  streaming: boolean;
  /** 書いている途中の返答が最後に届いた時刻（描くときに読む） */
  streamedAt: () => string | null;
  live: ChatLive;
  agents: SubagentEntry[];
  busy: boolean;
}): ReactNode | null {
  useTicker(busy ? TICK_ACTIVITY : null);
  if (!busy) return null;
  // 書いている途中の返答が最後に届いた時刻は、描くときにチャットの店から読む（作業中は 15 秒ごとに描き直す）
  const streamedAt = lastStreamedAt();
  const running = agents.filter((s) => s.status === "running");
  const activity = {
    parent: activityOf(latestOf(events.at(-1)?.created_at, streamedAt, chat.turn_started_at, ...running.map((s) => s.lastActivityAt))),
    stalled: stalledAgents(agents),
  };
  return workingLabel(chat, last, streaming, live, running.length, activity);
}
