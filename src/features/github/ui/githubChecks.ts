// PR のチェックの所要時間（純粋関数）
import type { GitHubCheck } from "@shared/github/types";
import { elapsedBetween, formatDuration } from "@/foundation/ui/lib/time";

/** 所要時間（終わったものは始まりから終わりまで、動いているものは今までに「〜」を添える。時刻がない・おかしければ null） */
export function checkDuration(check: Pick<GitHubCheck, "started_at" | "completed_at">, now = Date.now()): string | null {
  const ms = elapsedBetween(check.started_at, check.completed_at, now);
  if (ms === null) return null;
  return check.completed_at ? formatDuration(ms) : `${formatDuration(ms)}〜`;
}
