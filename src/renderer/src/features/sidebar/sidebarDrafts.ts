const EMPTY: never[] = [];

/** まとめるときはピン留めした下書きも所属先へ。まとめないときだけ「固定」に抜き出す */
export function splitPinnedDrafts<D extends { pinned: boolean }>(all: D[], extract: boolean): { drafts: D[]; pinnedDrafts: D[] } {
  if (!all.some((d) => d.pinned)) return { drafts: all, pinnedDrafts: EMPTY };
  if (!extract) return { drafts: [...all].sort((a, b) => Number(b.pinned) - Number(a.pinned)), pinnedDrafts: EMPTY };
  const drafts = all.filter((d) => !d.pinned);
  return { drafts: drafts.length === 0 ? EMPTY : drafts, pinnedDrafts: all.filter((d) => d.pinned) };
}
