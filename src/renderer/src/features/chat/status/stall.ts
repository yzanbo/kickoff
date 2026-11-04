import type { SubagentEntry } from "@shared/chat/subagents";

/**
 * 作業中のチャット・サブエージェントが、本当に動いているかの目安（Claude Code に「いま動いているか」を問い合わせる手段はないので、
 * 最後に何かが届いた時刻で見る）。画面は useTicker で定期的に描き直し、この時間を過ぎたら「動きがありません」と知らせる
 */
export const STALL_MS = 10 * 60_000;

/** 「最後の動き」を出し始める時間（それより短ければ、動いているとみなして出さない） */
const QUIET_MS = 60_000;

/** 最後に動いてからの時間（ミリ秒。時刻がなければ 0） */
export function silentMs(lastAt: string | undefined, now = Date.now()): number {
  return lastAt ? Math.max(0, now - new Date(lastAt).getTime()) : 0;
}

/** いちばん新しい時刻（ISO の文字列。なければ undefined） */
export function latestOf(...times: (string | undefined | null)[]): string | undefined {
  let latest: string | undefined;
  for (const t of times) if (t && (!latest || new Date(t).getTime() > new Date(latest).getTime())) latest = t;
  return latest;
}

/** 動きの様子: quiet = しばらく静か（最後の動きを添える）/ stalled = 長く動きがない（注意の色で知らせる） */
export interface Activity {
  level: "active" | "quiet" | "stalled";
  minutes: number;
}

export function activityOf(lastAt: string | undefined, now = Date.now()): Activity {
  const ms = silentMs(lastAt, now);
  const minutes = Math.floor(ms / 60_000);
  return { level: ms >= STALL_MS ? "stalled" : ms >= QUIET_MS ? "quiet" : "active", minutes };
}

/** 動きの文（静か: 「最後の動き 3 分前」/ 長く動きがない: 「12 分動きがありません（Bash の結果待ち）」/ 動いている: 空） */
export function activityText(activity: Activity, pendingTool?: string): string {
  if (activity.level === "active") return "";
  if (activity.level === "quiet") return `最後の動き ${activity.minutes} 分前`;
  return `${activity.minutes} 分動きがありません${pendingTool ? `（${pendingTool} の結果待ち）` : ""}`;
}

/** 実行中なのに長く動きがないサブエージェント */
export function stalledAgents(entries: SubagentEntry[], now = Date.now()): SubagentEntry[] {
  return entries.filter((s) => s.status === "running" && activityOf(s.lastActivityAt, now).level === "stalled");
}
