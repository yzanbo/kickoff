import type { NamedView } from "@/foundation/ui/lib/namedViews";
import { sameHiddenCardFields } from "./cardFields";
import { sameChatSort } from "./chatSort";
import { parseViewState, type BoardViewState } from "./layout";

// 保存したビュー（ボードの見え方の組に名前を付けたもの。形は layout.ts の BoardViewState）。読み書きは useSavedViews、ここは読み方と比べ方（純粋な関数）

/** 保存したビュー 1 つ（名前を付けた見え方。一覧の操作は lib/namedViews.ts） */
export type SavedView = NamedView<BoardViewState>;

/** 保存したビューの一覧を読む（見え方の合わないものは捨てる） */
export function parseSavedViews(list: readonly { id: string; name: string; state: unknown }[]): SavedView[] {
  return list.flatMap((v) => {
    const state = parseViewState(v.state);
    return state ? [{ id: v.id, name: v.name, state }] : [];
  });
}

/**
 * いまの見え方が保存したビューと同じか（選んでいるビューの印）。表示項目を持たないビュー（初めからあるビュー）は、それを比べない
 */
export function sameViewState(a: BoardViewState, b: BoardViewState): boolean {
  return (
    a.view === b.view &&
    a.lanes === b.lanes &&
    a.columns === b.columns &&
    a.archive === b.archive &&
    sameChatSort(a.sort, b.sort) &&
    (a.cardHidden === undefined || b.cardHidden === undefined || sameHiddenCardFields(a.cardHidden, b.cardHidden))
  );
}

/** いまの見え方に合う、いちばん前のビュー */
export const activeView = (views: readonly SavedView[], current: BoardViewState) => views.find((v) => sameViewState(v.state, current));
