// 使用枠の上限（claude.ai のプランの 5 時間・週の枠）で止まったことの見分けと、枠が戻る時刻（Node 依存なし）

/** 失敗の文が、使用枠の上限に達したことを示すものか（rate_limit_event が届かない古い Claude Code の目印） */
export function isUsageLimitError(message: string | null | undefined): boolean {
  return Boolean(message) && /usage limit|hit your limit|limit reached/i.test(message!);
}

/** Claude Code が知らせる枠の戻る時刻（Unix 時刻。秒・ミリ秒のどちらでも）を ISO の文字列にする */
export function resetTimeOf(resetsAt: number | undefined): string | null {
  if (resetsAt === undefined || !Number.isFinite(resetsAt) || resetsAt <= 0) return null;
  return new Date(resetsAt < 1e12 ? resetsAt * 1000 : resetsAt).toISOString();
}
