import { parseChatSort, sameChatSort, type ChatSort } from "./chatSort";

// 保存したビュー（ボードの見え方の組に名前を付けたもの。Notion のビューを参考に）。読み書きは useSavedViews、ここは形と比べ方・並びの操作（純粋な関数）

/** 表示（feed は全プロジェクトのボードだけ） */
const VIEW_KINDS = ["board", "list", "feed"] as const;
const VIEW_LANES = ["none", "group", "worktree", "project"] as const;
/** 列の分け方（groupsState = グループ×状態。グループの列の中を状態で小分け） */
const VIEW_COLUMNS = ["state", "groups", "groupsState", "none"] as const;
const VIEW_ARCHIVES = ["all", "active", "archived"] as const;

/** ボードの見え方（保存するもの。保存の形 Record<string, unknown> に入れられるよう type で書く） */
export type BoardViewState = {
  view: (typeof VIEW_KINDS)[number];
  /** 段の分け方（分けないなら none） */
  lanes: (typeof VIEW_LANES)[number];
  /**
   * 列の分け方（全プロジェクトのボードは state / groups / groupsState / none。プロジェクトのボードはリストの分け方だけで、リストのとき state / none、
   * ほかの表示ではない。前の版のプロジェクトのボードのビューの値は projectViewState で読み替える）
   */
  columns?: (typeof VIEW_COLUMNS)[number];
  sort: ChatSort;
  archive: (typeof VIEW_ARCHIVES)[number];
};

export interface SavedView {
  id: string;
  name: string;
  state: BoardViewState;
}

const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T => list.includes(value as T);

/** 保存した見え方を読む（合わない項目があれば undefined。そのビューは捨てる） */
export function parseViewState(value: unknown): BoardViewState | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const v = value as Record<string, unknown>;
  const sort = parseChatSort(v.sort);
  // 前の版の表（table）のビューはリストとして読む（表はなくした）
  const kind = v.view === "table" ? "list" : v.view;
  if (!oneOf(VIEW_KINDS, kind) || !oneOf(VIEW_LANES, v.lanes) || !oneOf(VIEW_ARCHIVES, v.archive) || !sort) return undefined;
  if (v.columns !== undefined && !oneOf(VIEW_COLUMNS, v.columns)) return undefined;
  // 前の版のビューのリストの行（compact）・表で隠す列（hidden）は読まない（リストの行はいつも 1 行に、表はなくした）
  return {
    view: kind,
    lanes: v.lanes,
    ...(v.columns === undefined ? {} : { columns: v.columns }),
    sort,
    archive: v.archive,
  };
}

/**
 * プロジェクトのボードの見え方に読み替える: 列の分け方はリストのときだけ（状態で分けない none か、それ以外は state）、ほかの表示では持たない
 * （前の版で保存したグループ・グループ×状態・列の分け方なしのビューも、リストなら状態で分ける形として当てて比べる）
 */
export function projectViewState(state: BoardViewState): BoardViewState {
  const { columns, ...rest } = state;
  return state.view === "list" ? { ...rest, columns: columns === "none" ? "none" : "state" } : rest;
}

/** 保存したビューの一覧を読む（見え方の合わないものは捨てる） */
export function parseSavedViews(list: readonly { id: string; name: string; state: unknown }[]): SavedView[] {
  return list.flatMap((v) => {
    const state = parseViewState(v.state);
    return state ? [{ id: v.id, name: v.name, state }] : [];
  });
}

/**
 * いまの見え方が保存したビューと同じか（選んでいるビューの印）。列の分け方を持たないビュー（前の版のプロジェクトのボードのもの）は列の分け方を比べない
 */
export function sameViewState(a: BoardViewState, b: BoardViewState): boolean {
  return (
    a.view === b.view &&
    a.lanes === b.lanes &&
    (a.columns === undefined || b.columns === undefined || a.columns === b.columns) &&
    a.archive === b.archive &&
    sameChatSort(a.sort, b.sort)
  );
}

/** いまの見え方に合う、いちばん前のビュー */
export const activeView = (views: readonly SavedView[], current: BoardViewState) => views.find((v) => sameViewState(v.state, current));

/** 名前を比べる形（前後の空白・全角半角・大文字小文字の違いは同じ名前とみなす） */
const nameKey = (name: string) => name.trim().normalize("NFKC").toLowerCase();

/**
 * 同じ一覧にもう同じ名前のビューがあるか（利用者の依頼で同じ名前は付けられない）。名前を変えるときは、そのビュー自身は除く（exceptId）
 */
export const viewNameTaken = (views: readonly SavedView[], name: string, exceptId?: string): boolean =>
  views.some((v) => v.id !== exceptId && nameKey(v.name) === nameKey(name));

export const addView = (views: readonly SavedView[], view: SavedView): SavedView[] => [...views, view];

export const renameView = (views: readonly SavedView[], id: string, name: string): SavedView[] => views.map((v) => (v.id === id ? { ...v, name } : v));

export const replaceViewState = (views: readonly SavedView[], id: string, state: BoardViewState): SavedView[] =>
  views.map((v) => (v.id === id ? { ...v, state } : v));

export const removeView = (views: readonly SavedView[], id: string): SavedView[] => views.filter((v) => v.id !== id);
