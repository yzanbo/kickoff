import type { BucketBy, BucketHead } from "@/features/chatList/ui";
import { hiddenCardFields, type CardField } from "./cardFields";
import { DEFAULT_CHAT_SORT, parseChatSort, type ChatSort } from "./chatSort";

// ボードの見え方（全プロジェクトのボード・プロジェクトのボードで 1 つずつ覚える組）と、そこから列・段の分け方を決める純粋な関数。
// 保存は storage.ts の layoutAll・layoutProject、読み書きは BoardContext.tsx の useBoardViewSetting

/** all = 全プロジェクトのボード / project = プロジェクトのボード（すべてのプロジェクトで共通） */
export type BoardKind = "all" | "project";

/** 表示（feed は全プロジェクトのボードだけ） */
const VIEW_KINDS = ["board", "list", "feed"] as const;
/** 段の分け方（none = 分けない） */
const VIEW_LANES = ["none", "group", "worktree", "project"] as const;
/** 列の分け方（groupsState = グループ×状態。グループの列の中を状態で小分け） */
const VIEW_COLUMNS = ["state", "groups", "groupsState", "none"] as const;
const VIEW_ARCHIVES = ["all", "active", "archived"] as const;

export type BoardLane = Exclude<(typeof VIEW_LANES)[number], "none">;

/** ボードの見え方（保存したビューにも入れる。保存の形 Record<string, unknown> に入れられるよう type で書く） */
export type BoardViewState = {
  view: (typeof VIEW_KINDS)[number];
  lanes: (typeof VIEW_LANES)[number];
  columns: (typeof VIEW_COLUMNS)[number];
  sort: ChatSort;
  /** アーカイブでの絞り込み（サイドバー・パネルのタブのアーカイブを出すかとは連動しない） */
  archive: (typeof VIEW_ARCHIVES)[number];
  /** 表示項目で隠している項目（初めからあるビューは持たず、そのときは当てても表示項目を変えない） */
  cardHidden?: CardField[];
};
/** いまの見え方（表示項目もいつも持つ） */
export type BoardLayoutState = Required<BoardViewState>;

/** 初めに隠す表示項目（状態・プロジェクト・モデル・最終更新だけを出す。メニューの「既定に戻す」もこの値） */
export const DEFAULT_CARD_HIDDEN: readonly CardField[] = ["group", "worktree", "pending", "turns", "cost", "context", "created"];

/** 覚えていないときの見え方（初めからあるビューの先頭と同じ） */
export const DEFAULT_BOARD_VIEW: Record<BoardKind, BoardLayoutState> = {
  all: { view: "board", lanes: "project", columns: "groups", sort: DEFAULT_CHAT_SORT, archive: "active", cardHidden: [...DEFAULT_CARD_HIDDEN] },
  project: { view: "board", lanes: "none", columns: "groups", sort: DEFAULT_CHAT_SORT, archive: "active", cardHidden: [...DEFAULT_CARD_HIDDEN] },
};

/** ボードで選べる段の分け方（ボタンの並び。グループはプロジェクトのボード、プロジェクトは全プロジェクトのボードだけ） */
export const LANES_OF: Record<BoardKind, readonly BoardLane[]> = { all: ["project", "worktree"], project: ["group", "worktree"] };

const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T => list.includes(value as T);

/** 保存した見え方を読む（合わない項目があれば undefined。そのビューは捨てる） */
export function parseViewState(value: unknown): BoardViewState | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const v = value as Record<string, unknown>;
  const sort = parseChatSort(v.sort);
  if (!oneOf(VIEW_KINDS, v.view) || !oneOf(VIEW_LANES, v.lanes) || !oneOf(VIEW_COLUMNS, v.columns) || !oneOf(VIEW_ARCHIVES, v.archive) || !sort) return undefined;
  if (v.cardHidden !== undefined && !Array.isArray(v.cardHidden)) return undefined;
  return {
    view: v.view,
    lanes: v.lanes,
    columns: v.columns,
    sort,
    archive: v.archive,
    // 知らない項目の名前（消した項目）は読まない
    ...(Array.isArray(v.cardHidden) ? { cardHidden: [...hiddenCardFields(v.cardHidden.filter((x): x is string => typeof x === "string"))] } : {}),
  };
}

/** 覚えたいまの見え方を読む（読めなければ初めの見え方） */
export function parseLayout(value: unknown, kind: BoardKind): BoardLayoutState {
  const state = parseViewState(value);
  return state ? { ...state, cardHidden: state.cardHidden ?? [...DEFAULT_CARD_HIDDEN] } : DEFAULT_BOARD_VIEW[kind];
}

/**
 * ビューを当てたときのいまの見え方。そのボードで選べない段の分け方は段だけそのまま、表示項目を持たないビューは表示項目をそのまま、
 * プロジェクトのボードではフィードを当てない（表示だけそのまま）
 */
export function applyView(current: BoardLayoutState, view: BoardViewState, kind: BoardKind): BoardLayoutState {
  const lanes = view.lanes === "none" || LANES_OF[kind].includes(view.lanes) ? view.lanes : current.lanes;
  return { ...view, view: view.view === "feed" && kind !== "all" ? current.view : view.view, lanes, cardHidden: view.cardHidden ?? current.cardHidden };
}

/** 状態の列は、チャットがなくてもすべて出す（段・グループはチャットか下書きのあるものだけ） */
const keepColumns = (head: BucketHead) => head.kind === "status";
/** 段: グループ（プロジェクトのボード）では、チャットのないグループの段も出す（カードを落としてそのグループへ移せるように） */
const keepColumnsAndGroups = (head: BucketHead) => head.kind === "status" || head.kind === "group";

/** 列・段の決まり（見え方とボードの種類から、描き分けに要るものを決める） */
export function boardLayout(state: BoardViewState, kind: BoardKind) {
  const all = kind === "all";
  const feed = all && state.view === "feed";
  /** ボード / リスト（フィードのときはボード。描かない） */
  const view: "board" | "list" = state.view === "list" ? "list" : "board";
  // そのボードで選べない段の分け方を覚えていたら、そのボードの初めの段
  const split = state.lanes !== "none";
  const lanes: BoardLane = state.lanes !== "none" && LANES_OF[kind].includes(state.lanes) ? state.lanes : all ? "project" : "worktree";
  const groupColumns = state.columns === "groups" || state.columns === "groupsState";
  // グループの列は、全プロジェクトのボードでは段がプロジェクトのときだけ（グループはプロジェクトごとのもの）、プロジェクトのボードではボードのときだけ
  // （リストでは段の「グループ」と同じ見た目になる）。選べないときに覚えた「グループ」は状態の列で出し、選べる形に戻すとグループに戻る
  const groupsAvailable = all ? split && lanes === "project" : view !== "list";
  const byGroup = groupsAvailable && groupColumns;
  const flat = state.columns === "none";
  // プロジェクトのボードでグループの列にしているときは、段の「グループ」は選べない（列と同じ分け方になる）。覚えた段はそのままで、分けない形で出す
  const laneSplit = split && !(byGroup && !all && lanes === "group");
  // プロジェクトのボードの段: グループでは、カードを別のグループの段へドラッグしてグループを移す
  const groupLanes = !all && laneSplit && lanes === "group";
  // グループの列は、全プロジェクトのボードではプロジェクトの段の中でそのプロジェクトのグループに分ける。プロジェクトのボードでは段ごとか、まとめて 1 つにして中をグループの列に
  const bucketBy: BucketBy | BucketBy[] = byGroup ? (all ? "project" : laneSplit ? [lanes] : []) : flat ? (laneSplit ? [lanes] : []) : laneSplit ? [lanes, "status"] : "status";
  return {
    feed,
    view,
    lanes,
    laneSplit,
    /** 段の切り替えに出す値（分けていなければ none）と選択肢 */
    laneValue: laneSplit ? lanes : ("none" as const),
    laneChoices: byGroup && !all ? LANES_OF[kind].filter((o) => o !== "group") : LANES_OF[kind],
    groupsAvailable,
    byGroup,
    /** グループの列の中を状態で小分けにする */
    byState: byGroup && state.columns === "groupsState",
    flat,
    groupLanes,
    bucketBy,
    // グループの列では、チャットのないプロジェクトの段も出す（ほかのプロジェクトのチャットを落としてそのグループへ移せるように）
    keepEmpty: byGroup ? true : groupLanes ? keepColumnsAndGroups : keepColumns,
  };
}
export type BoardLayout = ReturnType<typeof boardLayout>;

/**
 * 列の分け方の「グループ」「状態」のボタンを押したときの次の値（4 つの値を 2 つのオン・オフに読み替える）。
 * groups は「グループ」を出しているか（出さないときに覚えた「グループ」は状態をオンにした形で見せる）
 */
export function toggleColumns(columns: BoardViewState["columns"], groups: boolean, key: "state" | "groups"): BoardViewState["columns"] {
  const on = columnsOn(columns, groups);
  const next = key === "groups" ? { groups: !on.groups, state: on.state } : { groups: on.groups, state: !on.state };
  return next.groups ? (next.state ? "groupsState" : "groups") : next.state ? "state" : "none";
}

/** 列の分け方のボタンのオン・オフ */
export function columnsOn(columns: BoardViewState["columns"], groups: boolean) {
  const groupOn = groups && (columns === "groups" || columns === "groupsState");
  return { groups: groupOn, state: groupOn ? columns === "groupsState" : columns !== "none" };
}
