// プロジェクトのタブの並び（ドラッグで並べ替える）。まとまり（ボード・チャット / ファイル・検索・変更）は外へ動かすときはまとまりごと、
// 同じまとまりの中では 1 つずつ並べ替える。並びはタブの名前の 1 本の列（保存は PROJECT_TAB_ORDER）で持ち、まとまりはいつも続けて並べる

/** タブのまとまり（tabs はタブの名前を持つもの） */
export interface TabGroup<T extends { tab: string }> {
  key: string;
  tabs: readonly T[];
}

/** 覚えた並び（タブの名前の列）で、まとまりとその中のタブを並べる（覚えていないものは初めの並びのまま後ろへ） */
export function applyTabOrder<T extends { tab: string }, G extends TabGroup<T>>(groups: readonly G[], saved: readonly string[]): G[] {
  const rank = (tab: string) => {
    const i = saved.indexOf(tab);
    return i < 0 ? Infinity : i;
  };
  const sortTabs = (tabs: readonly T[]) => tabs.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t.tab) - rank(b.t.tab) || a.i - b.i).map((x) => x.t);
  return groups
    .map((g, i) => ({ g: { ...g, tabs: sortTabs(g.tabs) }, i, rank: Math.min(...g.tabs.map((t) => rank(t.tab))) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.g);
}

/** 並べたまとまりを、保存する 1 本の列にする */
export function flatTabOrder(groups: readonly TabGroup<{ tab: string }>[]): string[] {
  return groups.flatMap((g) => g.tabs.map((t) => t.tab));
}

/** before / after: 落とした相手の前か後ろか */
export type DropSide = "before" | "after";

/** 同じまとまりの中で、タブ moved を target の前・後ろへ動かした並び（ほかのまとまりのタブなら変えない） */
export function moveTabInGroup(groups: readonly TabGroup<{ tab: string }>[], moved: string, target: string, side: DropSide): string[] {
  const next = groups.map((g) => {
    const tabs = g.tabs.map((t) => t.tab);
    if (!tabs.includes(moved) || !tabs.includes(target) || moved === target) return tabs;
    const rest = tabs.filter((t) => t !== moved);
    rest.splice(rest.indexOf(target) + (side === "after" ? 1 : 0), 0, moved);
    return rest;
  });
  return next.flat();
}

/** まとまり moved を、まとまり target の前・後ろへ動かした並び（中のタブの並びはそのまま） */
export function moveGroup(groups: readonly TabGroup<{ tab: string }>[], moved: string, target: string, side: DropSide): string[] {
  const from = groups.find((g) => g.key === moved);
  if (!from || moved === target || !groups.some((g) => g.key === target)) return flatTabOrder(groups);
  const rest = groups.filter((g) => g.key !== moved);
  rest.splice(rest.findIndex((g) => g.key === target) + (side === "after" ? 1 : 0), 0, from);
  return flatTabOrder(rest);
}
