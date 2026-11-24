/** 右端のアイコンの列のタブ（並べ替えの tab は右サイドバーの中身の名前 = プロジェクトのタブの名前） */
export interface RailTab<I> {
  tab: string;
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
 * 右端のアイコンの列のまとまり（純粋な関数）。プロジェクトのタブのまとまりから、右サイドバーに出さない画面（ボード・チャット。inRail が false）を除き、
 * 中身がなくなったまとまりは出さない（ブラウザは列の先頭に別に置く）。並べ替えはプロジェクトのタブと同じ仕組みで、並びも共通
 */
export function railGroupsOf<I>(
  groups: readonly { key: string; label: string; tabs: readonly { tab: string; label: string; tip?: string; icon: I }[] }[],
  inRail: (tab: string) => boolean,
): RailGroup<I>[] {
  return groups.flatMap((g) => {
    const tabs = g.tabs.flatMap((t) => (inRail(t.tab) ? [{ tab: t.tab, label: t.tip ?? t.label, icon: t.icon }] : []));
    return tabs.length > 0 ? [{ key: g.key, label: g.label, tabs }] : [];
  });
}
