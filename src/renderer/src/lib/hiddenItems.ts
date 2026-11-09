// 出す・隠すを項目ごとに選ぶ設定の補助（チャットの見出しに出す項目・ボードの表示項目）。
// 覚えるのは隠した項目だけなので、項目を増やしても初めは表示になる。保存した値に残った知らない名前は見ない

/** 保存した値から、知っている項目だけを取り出す（all は項目の一覧） */
export function hiddenItemsOf<T extends string>(all: readonly T[], saved: readonly string[]): ReadonlySet<T> {
  return new Set(all.filter((i) => saved.includes(i)));
}

/** 隠している項目が同じか（保存した値の順・知らない名前は見ない。「既定に戻す」を押せるかに使う） */
export function sameHiddenItemsOf<T extends string>(all: readonly T[], a: readonly string[], b: readonly string[]): boolean {
  const left = hiddenItemsOf(all, a);
  const right = hiddenItemsOf(all, b);
  return left.size === right.size && [...left].every((i) => right.has(i));
}

/** item の表示・非表示を入れ替えた、保存する値（項目の一覧の順にそろえる） */
export function toggleHiddenItem<T extends string>(all: readonly T[], saved: readonly string[], item: T): T[] {
  const hidden = hiddenItemsOf(all, saved);
  return all.filter((i) => (i === item ? !hidden.has(i) : hidden.has(i)));
}
