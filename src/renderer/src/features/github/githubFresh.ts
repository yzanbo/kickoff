// GitHub タブの一覧で、取り直して新しくなった行を見分ける（要件 5.11・仕様書 6「新しくなった行は少しの間だけ色を付ける」）
import type { GitHubItem } from "@shared/types";

/** 新しくなった行に色を付けておく長さ（ミリ秒。CSS の github-item-fresh の長さと同じ） */
export const GITHUB_FRESH_MS = 4000;

/**
 * 取り直しで新しくなった行の番号: 前の一覧にあって更新の時刻が変わったものと、前の一覧になく、前の一覧のいちばん新しい更新より後に更新されたもの
 * （絞り込みの外から入ってきただけの古い行は除く）。前の一覧がなければ（初めて読んだ・絞り込みを変えた）何も返さない
 */
export function freshItemNumbers(prev: readonly GitHubItem[] | null, next: readonly GitHubItem[]): number[] {
  if (!prev) return [];
  const before = new Map(prev.map((i) => [i.number, i.updated_at]));
  const newest = prev.reduce<string | null>((max, i) => (max === null || i.updated_at > max ? i.updated_at : max), null);
  return next
    .filter((i) => {
      const was = before.get(i.number);
      if (was !== undefined) return was !== i.updated_at;
      return newest !== null && i.updated_at > newest;
    })
    .map((i) => i.number);
}
