import { parseChatSort, sameChatSort, type ChatSort } from "./chatSort";

// 保存したビュー（ボードの見え方の組に名前を付けたもの。Notion のビューを参考に）。読み書きは useSavedViews、ここは形と比べ方・並びの操作（純粋な関数）

/** 表示（feed は全プロジェクトのボードだけ） */
const VIEW_KINDS = ["board", "list", "table", "feed"] as const;
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
   * 列の分け方（全プロジェクトのボードは state / groups / groupsState / none、プロジェクトのボードは state / groups / groupsState。
   * 前の版で保存したプロジェクトのボードのビューにはない（undefined。比べず、当てても変えない））
   */
  columns?: (typeof VIEW_COLUMNS)[number];
  sort: ChatSort;
  /** 表で隠す列 */
  hidden: readonly string[];
  /** リストの行を 1 行にまとめるか */
  compact: boolean;
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
  if (!oneOf(VIEW_KINDS, v.view) || !oneOf(VIEW_LANES, v.lanes) || !oneOf(VIEW_ARCHIVES, v.archive) || !sort) return undefined;
  if (v.columns !== undefined && !oneOf(VIEW_COLUMNS, v.columns)) return undefined;
  if (!Array.isArray(v.hidden) || typeof v.compact !== "boolean") return undefined;
  return {
    view: v.view,
    lanes: v.lanes,
    ...(v.columns === undefined ? {} : { columns: v.columns }),
    sort,
    hidden: v.hidden.filter((h): h is string => typeof h === "string"),
    compact: v.compact,
    archive: v.archive,
  };
}

/** 保存したビューの一覧を読む（見え方の合わないものは捨てる） */
export function parseSavedViews(list: readonly { id: string; name: string; state: unknown }[]): SavedView[] {
  return list.flatMap((v) => {
    const state = parseViewState(v.state);
    return state ? [{ id: v.id, name: v.name, state }] : [];
  });
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * いまの見え方が保存したビューと同じか（選んでいるビューの印）。表の列は表のとき、リストの行はリストのときだけ比べる
 * （ほかの表示では見えないので、違っていても同じビューとみなす）。列の分け方を持たないビュー（前の版のプロジェクトのボードのもの）は列の分け方を比べない
 */
export function sameViewState(a: BoardViewState, b: BoardViewState): boolean {
  return (
    a.view === b.view &&
    a.lanes === b.lanes &&
    (a.columns === undefined || b.columns === undefined || a.columns === b.columns) &&
    a.archive === b.archive &&
    sameChatSort(a.sort, b.sort) &&
    (a.view !== "table" || sameSet(a.hidden, b.hidden)) &&
    (a.view !== "list" || a.compact === b.compact)
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
