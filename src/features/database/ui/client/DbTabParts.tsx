import { Network, SquareTerminal, StickyNote } from "lucide-react";
import { DB_ENVIRONMENT_LABELS, type DbConnection } from "@shared/database/types";
import type { DbClientTab } from "@/features/database/ui/state/dbClientTabs";
import { TabObjectIcon } from "@/features/database/ui/tree/DbTreeObjects";
import { objectPathLabel } from "@/features/database/ui/dbFormat";
import { useSqlPending } from "@/features/database/ui/state/sqlSessions";
import { unsavedTables } from "@/features/database/ui/state/tabFlags";

// DB クライアントの右のタブの名前・説明・アイコン・パンくず（DatabaseClient から分けたもの）

/** 手順ノートの名前（フォルダと拡張子を外す） */
const noteName = (path: string) => path.split("/").pop()!.replace(/\.(md|markdown|html?)$/i, "");

/** タブのアイコン */
export function DbTabIcon({ tab: t }: { tab: DbClientTab }) {
  if (t.kind === "sql") return <SquareTerminal size={12} aria-hidden />;
  if (t.kind === "er") return <Network size={12} aria-hidden />;
  if (t.kind === "note") return <StickyNote size={12} aria-hidden />;
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

/** タブの名前（ER 図はまわりを見ているテーブル、なければ場所。手順ノートはノートの名前） */
export const tabLabel = (t: DbClientTab) => {
  if (t.kind === "sql") return t.title;
  if (t.kind === "note") return noteName(t.path);
  if (t.kind === "table") return t.name;
  return `ER 図${t.focus ? `: ${t.focus}` : t.path.schema || t.path.database ? `: ${t.path.schema ?? t.path.database}` : ""}`;
};

const tabWhat = (t: DbClientTab) => {
  if (t.kind === "table") return objectPathLabel(t.path, t.name);
  if (t.kind === "er") return `${objectPathLabel(t.path, t.focus ?? undefined)} の ER 図`;
  if (t.kind === "note") return `手順ノート: ${t.path}`;
  return t.title;
};

/** タブに乗せたときの説明（接続と環境 › 中身） */
export const tabTitle = (t: DbClientTab, c: DbConnection | undefined) =>
  [c ? `${c.name}（${DB_ENVIRONMENT_LABELS[c.environment]}）` : "", tabWhat(t)].filter(Boolean).join(" › ");

/** 狭い所でタブの上に出すパンくず */
export function breadcrumbOf(t: DbClientTab, c: DbConnection | undefined): string {
  const rest = t.kind === "sql" ? [t.title] : t.kind === "note" ? ["手順ノート", noteName(t.path)] : [t.path.database, t.path.schema, t.kind === "er" ? "ER 図" : t.name];
  return [c?.name, ...rest].filter(Boolean).join(" › ");
}
