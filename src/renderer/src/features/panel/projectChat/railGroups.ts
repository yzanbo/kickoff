import { sideViewOfTab, type SideView } from "./sideView";

/** 右端のアイコンの列の 1 つ（中身・名前・アイコン） */
export interface RailItem<I> {
  view: SideView;
  label: string;
  icon: I;
}

/** 右端のアイコンの列のまとまり（2 つ以上ならプロジェクトのタブと同じく薄い地でつなぐ） */
export interface RailGroup<I> {
  key: string;
  label: string;
  items: RailItem<I>[];
}

/**
 * 右端のアイコンの列のまとまり（純粋な関数）。ブラウザだけのまとまりを先頭に、そのあとプロジェクトのタブのまとまりを並べた順のまま
 * （右サイドバーに出さないボード・チャットは除き、中身がなくなったまとまりは出さない）。利用者の依頼で、プロジェクトの縦のタブと同じまとまりで見せる
 */
export function railGroupsOf<I>(
  groups: readonly { key: string; label: string; tabs: readonly { tab: string; label: string; tip?: string; icon: I }[] }[],
  browser: { label: string; icon: I },
): RailGroup<I>[] {
  const result: RailGroup<I>[] = [{ key: "browser", label: browser.label, items: [{ view: "browser", label: browser.label, icon: browser.icon }] }];
  for (const g of groups) {
    const items = g.tabs.flatMap((t) => {
      const view = sideViewOfTab(t.tab);
      return view ? [{ view, label: t.tip ?? t.label, icon: t.icon }] : [];
    });
    if (items.length > 0) result.push({ key: g.key, label: g.label, items });
  }
  return result;
}
