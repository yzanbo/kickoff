import type { NamedView } from "@/lib/namedViews";
import { hiddenCardFields, sameHiddenCardFields, type CardField } from "./cardFields";
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
   * 列の分け方（state / groups / groupsState / none。どちらのボードも同じ。前の版のプロジェクトのボードのビューにはないことがあり、projectViewState で state として読む）
   */
  columns?: (typeof VIEW_COLUMNS)[number];
  sort: ChatSort;
  archive: (typeof VIEW_ARCHIVES)[number];
  /** 表示項目で隠している項目（カード・行に出さないもの。前の版のビューにはなく、そのときは当てても表示項目を変えない） */
  cardHidden?: CardField[];
};

/** 保存したビュー 1 つ（名前を付けた見え方。一覧の操作は lib/namedViews.ts） */
export type SavedView = NamedView<BoardViewState>;

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
  if (v.cardHidden !== undefined && !Array.isArray(v.cardHidden)) return undefined;
  // 前の版のビューのリストの行（compact）・表で隠す列（hidden）は読まない（リストの行はいつも 1 行に、表はなくした）
  return {
    view: kind,
    lanes: v.lanes,
    ...(v.columns === undefined ? {} : { columns: v.columns }),
    sort,
    archive: v.archive,
    // 知らない項目の名前（消した項目）は読まない
    ...(Array.isArray(v.cardHidden) ? { cardHidden: [...hiddenCardFields(v.cardHidden.filter((x): x is string => typeof x === "string"))] } : {}),
  };
}

/**
 * プロジェクトのボードの見え方に読み替える: 列の分け方のない前の版のビュー（プロジェクトのボードの列がいつも状態だったころのもの）は state として読む
 */
export function projectViewState(state: BoardViewState): BoardViewState {
  return state.columns === undefined ? { ...state, columns: "state" } : state;
}

/** 保存したビューの一覧を読む（見え方の合わないものは捨てる） */
export function parseSavedViews(list: readonly { id: string; name: string; state: unknown }[]): SavedView[] {
  return list.flatMap((v) => {
    const state = parseViewState(v.state);
    return state ? [{ id: v.id, name: v.name, state }] : [];
  });
}

/**
 * いまの見え方が保存したビューと同じか（選んでいるビューの印）。列の分け方・表示項目を持たないビュー（前の版のもの）は、それを比べない
 */
export function sameViewState(a: BoardViewState, b: BoardViewState): boolean {
  return (
    a.view === b.view &&
    a.lanes === b.lanes &&
    (a.columns === undefined || b.columns === undefined || a.columns === b.columns) &&
    a.archive === b.archive &&
    sameChatSort(a.sort, b.sort) &&
    (a.cardHidden === undefined || b.cardHidden === undefined || sameHiddenCardFields(a.cardHidden, b.cardHidden))
  );
}

/** いまの見え方に合う、いちばん前のビュー */
export const activeView = (views: readonly SavedView[], current: BoardViewState) => views.find((v) => sameViewState(v.state, current));
