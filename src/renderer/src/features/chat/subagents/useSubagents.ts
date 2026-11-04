import { useEffect, useMemo, useState } from "react";
import type { BackgroundState, ChatEvent, SubagentInfo } from "@shared/types";
import { collectSubagents, type SubagentEntry } from "@shared/chat/subagents";
import { useServerEvent } from "@/api/events";
import { latestOf } from "@/features/chat/status/stall";

/** チャットのサブエージェントの一覧（途中経過はサーバーからのイベントで受け取る） */
export function useSubagents(chatId: number, events: ChatEvent[], busy: boolean, background: BackgroundState | null = null): SubagentEntry[] {
  const [progress, setProgress] = useState<Record<string, SubagentInfo>>({});
  // 途中経過が届いた時刻（作業 ID ごと。記録に残らないので、最後に動いた時刻に足す）
  const [progressAt, setProgressAt] = useState<Record<string, string>>({});
  useEffect(() => (setProgress({}), setProgressAt({})), [chatId]);
  useServerEvent((e) => {
    if (e.type === "chat_subagent" && e.chat_id === chatId) {
      // 作業 ID ごとに覚える（再開すると呼び出し ID が変わるため。行へのまとめ方は collectSubagents が決める）
      setProgress((prev) => ({ ...prev, [e.subagent.task_id]: e.subagent }));
      setProgressAt((prev) => ({ ...prev, [e.subagent.task_id]: new Date().toISOString() }));
    }
  });
  // 裏で動いているものの一覧（Claude Code が知らせる。作業中だけ）にないサブエージェントは、もう動いていない
  // 記録・途中経過・裏の作業が変わったときだけ組み立て直す（返答が届くたびの描き直しで、記録を全部たどらない）
  return useMemo(() => {
    const entries = collectSubagents(events, progress, busy, background ? new Set(background.tasks.map((t) => t.task_id)) : undefined);
    return entries.map((s) => {
      const at = s.agentId ? progressAt[s.agentId] : undefined;
      return at && s.status === "running" ? { ...s, lastActivityAt: latestOf(s.lastActivityAt, at) } : s;
    });
  }, [events, progress, progressAt, busy, background]);
}
