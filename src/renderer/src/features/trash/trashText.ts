// ゴミ箱の一覧の文（純粋な関数）

/** 消えるまでの残り（「あと 2 日 5 時間」「あと 3 時間」「あと 12 分」） */
export function remainingText(expiresAt: string, now = Date.now()): string {
  const min = Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 60_000));
  const days = Math.floor(min / (24 * 60));
  const hours = Math.floor((min % (24 * 60)) / 60);
  if (days > 0) return `あと ${days} 日${hours > 0 ? ` ${hours} 時間` : ""}`;
  if (hours > 0) return `あと ${hours} 時間`;
  return `あと ${min % 60} 分`;
}
