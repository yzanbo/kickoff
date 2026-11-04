import { useEffect, useRef, type ReactNode } from "react";
import type { Chat, ChatEvent, ChatLive } from "@shared/types";
import type { SubagentEntry } from "@shared/chat/subagents";
import { useTicker } from "@/hooks/useTicker";
import type { TimelineItem } from "@/features/chat/timeline/timelineItems";
import { activityOf, latestOf, stalledAgents } from "./stall";
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
  live,
  agents,
  busy,
}: {
  chat: Chat;
  events: ChatEvent[];
  /** 流れ全体の最後の項目（窓で途中を描いていても、いまの状態で決める） */
  last: TimelineItem | undefined;
  streaming: string;
  live: ChatLive;
  agents: SubagentEntry[];
  busy: boolean;
}): ReactNode | null {
  useTicker(busy ? 15_000 : 3_600_000);
  const streamedAt = useRef<string>(undefined);
  useEffect(() => {
    if (streaming) streamedAt.current = new Date().toISOString();
  }, [streaming]);
  if (!busy) return null;
  const running = agents.filter((s) => s.status === "running");
  const activity = {
    parent: activityOf(latestOf(events.at(-1)?.created_at, streamedAt.current, chat.turn_started_at, ...running.map((s) => s.lastActivityAt))),
    stalled: stalledAgents(agents),
  };
  return workingLabel(chat, last, streaming, live, running.length, activity);
}
