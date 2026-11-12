// DB クライアントの右のタブ（テーブル・SQL・ER 図・手順メモ）の並びと、表示中のタブ。置き場所（プロジェクトの DB タブ・右の欄・別ウィンドウ）ごとに覚える（保存は storageKeys の dbClientTabs）。
// 形の確かめと、開く・閉じる・選ぶを純粋関数で持つ（React に依らない）
import { DB_FILTER_OPS, DB_OBJECT_KINDS, type DbFilterOp, type DbObjectKind, type DbObjectPath, type DbRowFilter } from "@shared/types";

/** テーブル・ビューのタブ（同じ接続・場所・名前は 1 つ） */
export interface DbTableTab {
  key: string;
  kind: "table";
  connection_id: number;
  path: DbObjectPath;
  name: string;
  object: DbObjectKind;
  /** データの絞り込み（なければ絞らない。外部キーで移ったときは参照先の値で絞って開く） */
  filter?: DbRowFilter;
  /** 仮のタブ（木で 1 回押して開いた。次に木で押したもので置き換わる。ダブルクリック・絞り込みで固定） */
  preview?: boolean;
}

/** SQL のタブ（タブごとに DB の接続を 1 本持つ。key はその接続の名前にも使う） */
export interface DbSqlTab {
  key: string;
  kind: "sql";
  connection_id: number;
  title: string;
}

/**
 * ER 図のタブ（接続・場所ごとに 1 つ。focus: まわりだけ見るテーブル（null なら全体）・depth: その段の数・
 * names: 描くテーブル（null なら DB_ER_AUTO_MAX 以下のときだけすべて。多い DB では選ばせる））
 */
export interface DbErTab {
  key: string;
  kind: "er";
  connection_id: number;
  path: DbObjectPath;
  focus: string | null;
  depth: number;
  names: string[] | null;
}

/** 接続の手順メモのタブ（メモ 1 つに 1 つ。いくつもの接続で同じメモを使えるので、connection_id は開いた接続） */
export interface DbMemoTab {
  key: string;
  kind: "memo";
  connection_id: number;
  /** メモのフォルダからの相対パス */
  path: string;
}

export type DbClientTab = DbTableTab | DbSqlTab | DbErTab | DbMemoTab;

export interface DbClientTabs {
  tabs: DbClientTab[];
  active: string | null;
}

export const NO_DB_TABS: DbClientTabs = Object.freeze({ tabs: [], active: null }) as DbClientTabs;

const isPath = (v: unknown): v is DbObjectPath => {
  const p = v as DbObjectPath | null;
  return p !== null && typeof p === "object" && (p.database === null || typeof p.database === "string") && (p.schema === null || typeof p.schema === "string");
};

const isFilter = (v: unknown): v is DbRowFilter => {
  const f = v as DbRowFilter | null;
  return (
    f !== null &&
    typeof f === "object" &&
    (f.where === null || typeof f.where === "string") &&
    Array.isArray(f.filters) &&
    f.filters.every((x) => typeof x?.column === "string" && typeof x.value === "string" && DB_FILTER_OPS.includes(x.op as DbFilterOp))
  );
};

const isTab = (v: unknown): v is DbClientTab => {
  const t = v as Record<string, unknown> | null;
  if (!t || typeof t !== "object" || typeof t.key !== "string" || typeof t.connection_id !== "number") return false;
  if (t.kind === "sql") return typeof t.title === "string";
  if (t.kind === "memo") return typeof t.path === "string" && t.path !== "";
  if (t.kind === "er") {
    const namesOk = t.names === null || (Array.isArray(t.names) && t.names.every((n) => typeof n === "string"));
    return isPath(t.path) && (t.focus === null || typeof t.focus === "string") && typeof t.depth === "number" && namesOk;
  }
  return t.kind === "table" && typeof t.name === "string" && isPath(t.path) && DB_OBJECT_KINDS.includes(t.object as DbObjectKind) && (t.filter === undefined || isFilter(t.filter)) && (t.preview === undefined || typeof t.preview === "boolean");
};

/** 保存した値を読む（形の合わないタブは捨てる。表示中のタブがなければ最初のタブ） */
export function parseDbClientTabs(value: unknown): DbClientTabs | undefined {
  const v = value as Partial<DbClientTabs> | null;
  if (!v || typeof v !== "object" || !Array.isArray(v.tabs)) return undefined;
  const tabs = v.tabs.filter(isTab);
  const active = typeof v.active === "string" && tabs.some((t) => t.key === v.active) ? v.active : (tabs[0]?.key ?? null);
  return { tabs, active };
}

/**
 * テーブル・ビュー・関数・列挙型のタブのキー（同じ接続・場所・名前なら同じ）。
 * テーブルとビューは同じ名前を持てないので同じ印、関数・列挙型はテーブルと同じ名前を持てるので別の印
 */
export const tableTabKey = (connectionId: number, path: DbObjectPath, name: string, object: DbObjectKind = "table") =>
  `${object === "function" ? "f" : object === "enum" ? "e" : "t"}:${connectionId}:${path.database ?? ""}:${path.schema ?? ""}:${name}`;

/** タブを開く（同じキーがあれば選ぶだけ。新しいタブは表示中のタブの右に足す） */
export function openDbTab(state: DbClientTabs, tab: DbClientTab): DbClientTabs {
  if (state.tabs.some((t) => t.key === tab.key)) return { ...state, active: tab.key };
  const at = state.tabs.findIndex((t) => t.key === state.active);
  const tabs = [...state.tabs];
  tabs.splice(at < 0 ? tabs.length : at + 1, 0, tab);
  return { tabs, active: tab.key };
}

/** テーブルのタブを固定して開く（もうある仮のタブも固定する。filter を渡せば、もうあるタブもその絞り込みにする） */
export function openTableTab(state: DbClientTabs, tab: DbTableTab): DbClientTabs {
  const opened = pinDbTab(openDbTab(state, tab), tab.key);
  if (!tab.filter) return opened;
  return { ...opened, tabs: opened.tabs.map((t) => (t.key === tab.key && t.kind === "table" ? { ...t, filter: tab.filter } : t)) };
}

/**
 * テーブルのタブを仮のタブで開く（木で 1 回押したとき）: 同じキーがあれば選ぶだけ。いまの仮のタブを同じ場所で置き換え、なければ表示中のタブの右に足す。
 * keep が true の仮のタブ（保存していない変更がある）は置き換えずに固定して、新しい仮のタブを足す
 */
export function openPreviewTab(state: DbClientTabs, tab: DbTableTab, keep: (key: string) => boolean = () => false): DbClientTabs {
  if (state.tabs.some((t) => t.key === tab.key)) return { ...state, active: tab.key };
  const next: DbTableTab = { ...tab, preview: true };
  const current = state.tabs.find((t) => t.kind === "table" && t.preview);
  if (current && !keep(current.key)) return { tabs: state.tabs.map((t) => (t === current ? next : t)), active: next.key };
  return openDbTab(current ? pinDbTab(state, current.key) : state, next);
}

/** 仮のタブを固定する（仮でなければそのまま） */
export function pinDbTab(state: DbClientTabs, key: string): DbClientTabs {
  const found = state.tabs.find((t) => t.key === key);
  if (!found || found.kind !== "table" || !found.preview) return state;
  const { preview: _drop, ...pinned } = found;
  void _drop;
  return { ...state, tabs: state.tabs.map((t) => (t === found ? pinned : t)) };
}

/** テーブルのタブの絞り込みを変える（null なら外す。仮のタブは固定する） */
export function setTableFilter(state: DbClientTabs, key: string, filter: DbRowFilter | null): DbClientTabs {
  const pinned = pinDbTab(state, key);
  return {
    ...pinned,
    tabs: pinned.tabs.map((t) => {
      if (t.key !== key || t.kind !== "table") return t;
      if (filter) return { ...t, filter };
      const { filter: _drop, ...rest } = t;
      void _drop;
      return rest;
    }),
  };
}

/** タブを閉じる（表示中なら右隣、なければ左隣を表示） */
export function closeDbTab(state: DbClientTabs, key: string): DbClientTabs {
  const at = state.tabs.findIndex((t) => t.key === key);
  if (at < 0) return state;
  const tabs = state.tabs.filter((t) => t.key !== key);
  const active = state.active === key ? (tabs[at]?.key ?? tabs[at - 1]?.key ?? null) : state.active;
  return { tabs, active };
}

/** 消した接続のタブを閉じる */
export function closeConnectionTabs(state: DbClientTabs, connectionId: number): DbClientTabs {
  return state.tabs.filter((t) => t.connection_id === connectionId).reduce((s, t) => closeDbTab(s, t.key), state);
}

/** 新しい SQL のタブの名前（「SQL 1」「SQL 2」…。いま使っていないいちばん小さい番号） */
export function nextSqlTitle(state: DbClientTabs): string {
  const used = new Set(state.tabs.filter((t): t is DbSqlTab => t.kind === "sql").map((t) => t.title));
  let n = 1;
  while (used.has(`SQL ${n}`)) n++;
  return `SQL ${n}`;
}

/** 新しい SQL のタブのキー（SQL のタブの DB の接続の名前にも使う。英数字と -） */
const newSqlKey = () => `sql-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** 接続の新しい SQL のタブを開く（DB クライアントの中と、右の欄の ▾ のメニューから） */
export const openNewSqlTab = (state: DbClientTabs, connectionId: number): DbClientTabs =>
  openDbTab(state, { key: newSqlKey(), kind: "sql", connection_id: connectionId, title: nextSqlTitle(state) });

/** SQL のタブで流す接続を替える（入力欄の SQL はそのまま。タブのキー = ワーカーの中の接続の名前は変えない） */
export function setSqlConnection(state: DbClientTabs, key: string, connectionId: number): DbClientTabs {
  return { ...state, tabs: state.tabs.map((t) => (t.key === key && t.kind === "sql" ? { ...t, connection_id: connectionId } : t)) };
}

/** ER 図のタブのキー（接続・場所ごとに 1 つ） */
export const erTabKey = (connectionId: number, path: DbObjectPath) => `er:${connectionId}:${path.database ?? ""}:${path.schema ?? ""}`;

/**
 * ER 図のタブを開く（同じ場所のタブがあれば、focus を付け替えて選ぶ。focus がなければ全体）。
 * 選んで描いているテーブルに focus がなければ選び直す（多い DB では focus のまわりを選び直す）
 */
export function openErTab(state: DbClientTabs, connectionId: number, path: DbObjectPath, focus: string | null): DbClientTabs {
  const key = erTabKey(connectionId, path);
  const found = state.tabs.find((t): t is DbErTab => t.key === key && t.kind === "er");
  if (found) {
    const names = focus && found.names && !found.names.includes(focus) ? null : found.names;
    return { tabs: state.tabs.map((t) => (t === found ? { ...found, focus, names } : t)), active: key };
  }
  return openDbTab(state, { key, kind: "er", connection_id: connectionId, path, focus, depth: 1, names: null });
}

/** ER 図のタブの絞り込み（focus・段の数・描くテーブル）を変える */
export function updateErTab(state: DbClientTabs, key: string, patch: Partial<Pick<DbErTab, "focus" | "depth" | "names">>): DbClientTabs {
  return { ...state, tabs: state.tabs.map((t) => (t.key === key && t.kind === "er" ? { ...t, ...patch } : t)) };
}

/** 手順メモのタブのキー（メモのパスごとに 1 つ） */
export const memoTabKey = (path: string) => `memo:${path}`;

/** 手順メモのタブを開く（もう開いていれば選ぶだけ） */
export const openMemoTab = (state: DbClientTabs, connectionId: number, path: string): DbClientTabs =>
  openDbTab(state, { key: memoTabKey(path), kind: "memo", connection_id: connectionId, path });

/** 手順メモの名前が変わったら、タブのパスとキーを付け替える（同じメモのタブがほかにあれば、そちらを残してこれを閉じる） */
export function renameMemoTab(state: DbClientTabs, key: string, path: string): DbClientTabs {
  const next = memoTabKey(path);
  if (next === key) return state;
  if (state.tabs.some((t) => t.key === next)) return { ...closeDbTab(state, key), active: next };
  return {
    tabs: state.tabs.map((t) => (t.key === key && t.kind === "memo" ? { ...t, key: next, path } : t)),
    active: state.active === key ? next : state.active,
  };
}
