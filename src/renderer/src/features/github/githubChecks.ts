// PR のチェックの所要時間（純粋関数）
import type { GitHubCheck } from "@shared/types";
import { formatElapsed } from "@/lib/time";

/** 所要時間（終わったものは始まりから終わりまで、動いているものは今までに「〜」を添える。時刻がない・おかしければ null） */
export function checkDuration(check: Pick<GitHubCheck, "started_at" | "completed_at">, now = Date.now()): string | null {
  if (!check.started_at) return null;
  const end = check.completed_at ? Date.parse(check.completed_at) : now;
  const ms = end - Date.parse(check.started_at);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return check.completed_at ? formatElapsed(ms) : `${formatElapsed(ms)}〜`;
}
