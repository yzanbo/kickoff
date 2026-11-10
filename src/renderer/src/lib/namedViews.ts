// 名前を付けた見え方（ビュー）の一覧の操作（純粋な関数）。ボードの保存したビュー（features/board/savedViews.ts）とサイドバーのビュー
// （features/sidebar/sidebarViews.ts）で共通。見え方そのものの形・比べ方は、それぞれの側に置く

/** 名前を付けた見え方 1 つ（state はビューの種類ごとの形） */
export interface NamedView<S = unknown> {
  id: string;
  name: string;
  state: S;
}

/** 名前を比べる形（前後の空白・全角半角・大文字小文字の違いは同じ名前とみなす） */
const nameKey = (name: string) => name.trim().normalize("NFKC").toLowerCase();

/**
 * 同じ一覧にもう同じ名前のビューがあるか（利用者の依頼で同じ名前は付けられない）。名前を変えるときは、そのビュー自身は除く（exceptId）
 */
export const viewNameTaken = <V extends NamedView>(views: readonly V[], name: string, exceptId?: string): boolean =>
  views.some((v) => v.id !== exceptId && nameKey(v.name) === nameKey(name));

/** いまの見え方と同じビューがもうあるときの文（今のビューを新規保存を押せなくした理由。サイドバー・ボードで共通） */
export const sameViewExistsText = (name: string) => `いまの見え方と同じビュー「${name}」がすでにあります`;

export const addView = <V extends NamedView>(views: readonly V[], view: V): V[] => [...views, view];

export const renameView = <V extends NamedView>(views: readonly V[], id: string, name: string): V[] => views.map((v) => (v.id === id ? { ...v, name } : v));

export const replaceViewState = <V extends NamedView>(views: readonly V[], id: string, state: V["state"]): V[] =>
  views.map((v) => (v.id === id ? { ...v, state } : v));

export const removeView = <V extends NamedView>(views: readonly V[], id: string): V[] => views.filter((v) => v.id !== id);

/** ビュー moved を target の前（before）・後ろ（after）へ動かした一覧（どちらかがなければそのまま） */
export function moveView<V extends NamedView>(views: readonly V[], moved: string, target: string, side: "before" | "after"): V[] {
  const item = views.find((v) => v.id === moved);
  if (!item || moved === target || !views.some((v) => v.id === target)) return [...views];
  const rest = views.filter((v) => v.id !== moved);
  rest.splice(rest.findIndex((v) => v.id === target) + (side === "after" ? 1 : 0), 0, item);
  return rest;
}

/** 動かしても並びが変わらないか（自分の上・すぐ前の後ろ・すぐ後ろの前。落とす先にせず線を出さない） */
export const isNoopViewMove = <V extends NamedView>(views: readonly V[], moved: string, target: string, side: "before" | "after"): boolean =>
  moveView(views, moved, target, side).every((v, i) => v.id === views[i]?.id);
