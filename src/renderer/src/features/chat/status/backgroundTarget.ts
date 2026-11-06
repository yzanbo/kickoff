// 裏の作業の一覧の行から、流れの中のその呼び出しへ移る先を決める（純粋関数）
import type { SubagentEntry } from "@shared/chat/subagents";
import type { BackgroundTask, ChatEvent } from "@shared/types";
import { scopeOf } from "@/features/chat/subagents/subagentTree";

/** 移る先: 呼び出しの記録の ID と、サブエージェントの中で起動したものならそのサブエージェントの行のキー（メインなら null） */
export interface BackgroundCallTarget {
  eventId: number;
  agent: string | null;
}

/**
 * 裏の作業を起動した呼び出し（Bash など）の、流れの中の場所。起動した呼び出しの ID が届いていない・記録にないときは null。
 * サブエージェントの中で起動したものは、そのサブエージェント（再開した回の呼び出し ID も含めて引き当てる）
 */
export function backgroundCallTarget(task: BackgroundTask, events: readonly ChatEvent[], agents: readonly SubagentEntry[]): BackgroundCallTarget | null {
  if (!task.tool_use_id) return null;
  const use = events.findLast((e) => e.type === "tool_use" && e.data.id === task.tool_use_id);
  if (!use || use.type !== "tool_use") return null;
  const parent = use.data.parent;
  if (parent === undefined) return { eventId: use.id, agent: null };
  const owner = agents.find((s) => scopeOf(s).includes(parent));
  return owner ? { eventId: use.id, agent: owner.key } : null;
}
