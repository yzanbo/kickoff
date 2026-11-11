import { Network, SquareTerminal, StickyNote } from "lucide-react";
import { DB_ENVIRONMENT_LABELS, type DbConnection } from "@shared/types";
import type { DbClientTab } from "@/lib/dbClientTabs";
import { TabObjectIcon } from "./DbTreeObjects";
import { objectPathLabel } from "./dbFormat";
import { useSqlPending } from "./sqlSessions";
import { unsavedTables } from "./tabFlags";

// DB クライアントの右のタブの名前・説明・アイコン・パンくず（DatabaseClient から分けたもの）

/** 手順メモの名前（フォルダと拡張子を外す） */
const memoName = (path: string) => path.split("/").pop()!.replace(/\.(md|markdown|html?)$/i, "");

/** タブのアイコン */
export function DbTabIcon({ tab: t }: { tab: DbClientTab }) {
  if (t.kind === "sql") return <SquareTerminal size={12} aria-hidden />;
  if (t.kind === "er") return <Network size={12} aria-hidden />;
  if (t.kind === "memo") return <StickyNote size={12} aria-hidden />;
  return <TabObjectIcon object={t.object} />;
}

/** SQL のタブがトランザクションの途中なら、名前の後ろに「コミットしていない」印 */
export function PendingMark({ tabKey }: { tabKey: string }) {
  const pending = useSqlPending(tabKey);
  return pending ? <span className="db-tab-pending" data-tip="コミットしていない変更があります" aria-label="コミットしていない変更があります" /> : null;
}

/** テーブルのタブに保存していない変更があれば、名前の後ろに「保存していない」印（flagKey: unsavedKey） */
export function UnsavedMark({ flagKey }: { flagKey: string }) {
  const unsaved = unsavedTables.useFlag(flagKey);
  return unsaved ? <span className="db-tab-pending" data-tip="保存していない変更があります" aria-label="保存していない変更があります" /> : null;
}

/** タブの名前（ER 図はまわりを見ているテーブル、なければ場所。手順メモはメモの名前） */
export const tabLabel = (t: DbClientTab) => {
  if (t.kind === "sql") return t.title;
  if (t.kind === "memo") return memoName(t.path);
  if (t.kind === "table") return t.name;
  return `ER 図${t.focus ? `: ${t.focus}` : t.path.schema || t.path.database ? `: ${t.path.schema ?? t.path.database}` : ""}`;
};

const tabWhat = (t: DbClientTab) => {
  if (t.kind === "table") return objectPathLabel(t.path, t.name);
  if (t.kind === "er") return `${objectPathLabel(t.path, t.focus ?? undefined)} の ER 図`;
  if (t.kind === "memo") return `手順メモ: ${t.path}`;
  return t.title;
};

/** タブに乗せたときの説明（接続と環境 › 中身） */
export const tabTitle = (t: DbClientTab, c: DbConnection | undefined) =>
  [c ? `${c.name}（${DB_ENVIRONMENT_LABELS[c.environment]}）` : "", tabWhat(t)].filter(Boolean).join(" › ");

/** 狭い所でタブの上に出すパンくず */
export function breadcrumbOf(t: DbClientTab, c: DbConnection | undefined): string {
  const rest = t.kind === "sql" ? [t.title] : t.kind === "memo" ? ["手順メモ", memoName(t.path)] : [t.path.database, t.path.schema, t.kind === "er" ? "ER 図" : t.name];
  return [c?.name, ...rest].filter(Boolean).join(" › ");
}
