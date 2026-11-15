import { useMemo } from "react";
import type { BackgroundState, ChatEvent } from "@shared/types";
import { collectSubagents, type SubagentEntry } from "@shared/chat/subagents";
import { useChatProgress } from "@/features/chat/store/useChatStore";
import { latestOf } from "@/features/chat/status/stall";

/**
 * チャットのサブエージェントの一覧（途中経過はチャットの店の口から。届いた時刻（作業 ID ごと。記録に残らないので、最後に動いた時刻に足す）も一緒に持つ。
 * 店がチャットごとに持つので、同じチャットを何か所で開いても同じ途中経過になり、開き直しても消えない）
 */
export function useSubagents(chatId: number, events: ChatEvent[], busy: boolean, background: BackgroundState | null = null): SubagentEntry[] {
  const { progress, progressAt } = useChatProgress(chatId);
  // 裏で動いているものの一覧（Claude Code が知らせる。作業中だけ）にないサブエージェントは、もう動いていない
  // 記録・途中経過・裏の作業が変わったときだけ組み立て直す（返答が届くたびの描き直しで、記録を全部たどらない）
  return useMemo(() => {
    const entries = collectSubagents(events, progress, busy, background ? new Set(background.tasks.map((t) => t.task_id)) : undefined);
    const withProgress = entries.map((s) => {
      const at = s.agentId ? progressAt[s.agentId] : undefined;
      return at && s.status === "running" ? { ...s, lastActivityAt: latestOf(s.lastActivityAt, at) } : s;
    });
    return bubbleProgress(withProgress);
  }, [events, progress, progressAt, busy, background]);
}

/**
 * 途中経過の時刻を、入れ子の祖先の「最後の動き」にも伝える（孫の中の記録は届かず、途中経過だけが届くことがあるため。
 * 子の結果を待っている親を「動きがない」としない）。変わった行だけを作り直す
 */
function bubbleProgress(entries: SubagentEntry[]): SubagentEntry[] {
  const byKey = new Map(entries.map((s) => [s.key, s]));
  for (const s of entries) {
    let up = s.parentKey;
    for (let depth = 0; up !== undefined && s.lastActivityAt !== undefined && depth < 32; depth++) {
      const ancestor = byKey.get(up);
      if (!ancestor) break;
      const at = latestOf(ancestor.lastActivityAt, s.lastActivityAt);
      if (at !== ancestor.lastActivityAt) byKey.set(up, { ...ancestor, lastActivityAt: at });
      up = ancestor.parentKey;
    }
  }
  return entries.map((s) => byKey.get(s.key) ?? s);
}
