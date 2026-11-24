// バイト数の表示（画面とコアで同じ書き方。添付の札・AI への見出し・ゴミ箱・DB のセル・画像）

/** バイト数を読める大きさに（12 B / 3.4 KB / 1.2 MB / 2.0 GB） */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
