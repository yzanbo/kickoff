// 子チャットの深さの呼び名（1 = 子・2 = 孫・3 = ひ孫）。子と孫を見分けられるよう、画面の帯・タブの札と、AI に添える文脈で同じ呼び名にする

/** 深さの呼び名（「孫チャット」。4 段より深ければ「子チャット（4 段目）」） */
export function childDepthLabel(depth: number): string {
  if (depth <= 1) return "子チャット";
  if (depth === 2) return "孫チャット";
  if (depth === 3) return "ひ孫チャット";
  return `子チャット（${depth} 段目）`;
}

/** 札に出す短い呼び名（子・孫・ひ孫・4 段目） */
export function childDepthShort(depth: number): string {
  if (depth <= 1) return "子";
  if (depth === 2) return "孫";
  if (depth === 3) return "ひ孫";
  return `${depth} 段目`;
}
