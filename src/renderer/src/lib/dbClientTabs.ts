// DB クライアントの右のタブ（テーブル・SQL）の並びと、表示中のタブ。置き場所（プロジェクトの DB タブ・右の欄・別ウィンドウ）ごとに覚える（保存は storageKeys の dbClientTabs）。
// 形の確かめと、開く・閉じる・選ぶを純粋関数で持つ（React に依らない）
import { DB_OBJECT_KINDS, type DbObjectKind, type DbObjectPath } from "@shared/types";

/** テーブル・ビューのタブ（同じ接続・場所・名前は 1 つ） */
export interface DbTableTab {
  key: string;
  kind: "table";
  connection_id: number;
  path: DbObjectPath;
  name: string;
  object: DbObjectKind;
}

/** SQL のタブ（タブごとに DB の接続を 1 本持つ。key はその接続の名前にも使う） */
export interface DbSqlTab {
  key: string;
  kind: "sql";
  connection_id: number;
  title: string;
}

export type DbClientTab = DbTableTab | DbSqlTab;

export interface DbClientTabs {
  tabs: DbClientTab[];
  active: string | null;
}

export const NO_DB_TABS: DbClientTabs = Object.freeze({ tabs: [], active: null }) as DbClientTabs;

const isPath = (v: unknown): v is DbObjectPath => {
  const p = v as DbObjectPath | null;
  return p !== null && typeof p === "object" && (p.database === null || typeof p.database === "string") && (p.schema === null || typeof p.schema === "string");
};

const isTab = (v: unknown): v is DbClientTab => {
  const t = v as Record<string, unknown> | null;
  if (!t || typeof t !== "object" || typeof t.key !== "string" || typeof t.connection_id !== "number") return false;
  if (t.kind === "sql") return typeof t.title === "string";
  return t.kind === "table" && typeof t.name === "string" && isPath(t.path) && DB_OBJECT_KINDS.includes(t.object as DbObjectKind);
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
