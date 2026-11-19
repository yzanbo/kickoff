import { sideViewOfTab, type SideView } from "./sideView";

/** 右端のアイコンの列のタブ（並べ替えの tab は右サイドバーの中身の名前 = プロジェクトのタブの名前） */
export interface RailTab<I> {
  tab: Exclude<SideView, "browser">;
  label: string;
  icon: I;
}

/** 右端のアイコンの列のまとまり */
export interface RailGroup<I> {
  key: string;
  label: string;
  tabs: RailTab<I>[];
}

/**
 * 右端のアイコンの列のまとまり（純粋な関数）。プロジェクトのタブのまとまりから、右サイドバーに出さないボード・チャットを除き、
 * 中身がなくなったまとまりは出さない（ブラウザは列の先頭に別に置く）。並べ替えはプロジェクトのタブと同じ仕組みで、並びも共通
 */
export function railGroupsOf<I>(groups: readonly { key: string; label: string; tabs: readonly { tab: string; label: string; tip?: string; icon: I }[] }[]): RailGroup<I>[] {
  return groups.flatMap((g) => {
    const tabs = g.tabs.flatMap((t) => {
      const view = sideViewOfTab(t.tab);
      return view ? [{ tab: view, label: t.tip ?? t.label, icon: t.icon }] : [];
    });
    return tabs.length > 0 ? [{ key: g.key, label: g.label, tabs }] : [];
  });
}
