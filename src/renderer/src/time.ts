// 時刻の表示（相対時刻・使用枠のリセットまでの時間）

/** 「たった今」「5分前」「3時間前」、1 日より前は日付 */
export function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "たった今";
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  return new Date(iso).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

/** リセットまでの表示（5 時間枠は残り時間、週枠は日時） */
export function formatReset(resetsAt: string | null, now = Date.now()): string | null {
  if (!resetsAt) return null;
  const at = new Date(resetsAt);
  const diffMin = Math.max(0, Math.round((at.getTime() - now) / 60_000));
  if (diffMin < 24 * 60) {
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return `あと ${h > 0 ? `${h}時間` : ""}${m}分でリセット`;
  }
  const date = at.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
  const time = at.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time} にリセット`;
}

/** リセットまでの残りを短く（"3日後" / "5時間後" / "12分後"） */
export function resetInShort(resetsAt: string | null, now = Date.now()): string | null {
  if (!resetsAt) return null;
  const min = Math.max(0, Math.round((new Date(resetsAt).getTime() - now) / 60_000));
  if (min >= 24 * 60) return `${Math.round(min / (24 * 60))}日後`;
  if (min >= 60) return `${Math.round(min / 60)}時間後`;
  return `${min}分後`;
}

/** リセットまでの残り（"3日後にリセット" / "5時間後にリセット" / "12分後にリセット"） */
export function resetIn(resetsAt: string | null, now = Date.now()): string | null {
  const short = resetInShort(resetsAt, now);
  return short && `${short}にリセット`;
}
