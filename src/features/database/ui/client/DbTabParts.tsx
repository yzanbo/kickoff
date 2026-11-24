import "./DbTabParts.css";
import { Network, SquareTerminal, StickyNote } from "lucide-react";
import type { ReactNode } from "react";
import { DB_ENVIRONMENT_LABELS, type DbConnection } from "@shared/database/types";
import { CloseButton } from "@/foundation/ui/kit/IconButton";
import type { Tabs } from "@/foundation/ui/kit/tabs/useTabs";
import { cx } from "@/foundation/ui/lib/cx";
import type { DbClientTab, DbClientTabs } from "@/features/database/ui/dbClientTabs";
import { TabObjectIcon } from "@/features/database/ui/tree/DbTreeObjects";
import { objectPathLabel } from "@/features/database/ui/dbFormat";
import { useSqlPending } from "@/features/database/ui/state/sqlSessions";
import { unsavedKey, unsavedTables } from "@/features/database/ui/state/tabFlags";

// DB クライアントの右のタブの列と、タブの名前・説明・アイコン・パンくず（DatabaseClient から分けたもの）

/** 手順ノートの名前（フォルダと拡張子を外す） */
const noteName = (path: string) => path.split("/").pop()!.replace(/\.(md|markdown|html?)$/i, "");

/** タブのアイコン */
function DbTabIcon({ tab: t }: { tab: DbClientTab }) {
  if (t.kind === "sql") return <SquareTerminal size={12} aria-hidden />;
  if (t.kind === "er") return <Network size={12} aria-hidden />;
  if (t.kind === "note") return <StickyNote size={12} aria-hidden />;
  return <TabObjectIcon object={t.object} />;
}

/** SQL のタブがトランザクションの途中なら、名前の後ろに「コミットしていない」印 */
function PendingMark({ tabKey }: { tabKey: string }) {
  const pending = useSqlPending(tabKey);
  return pending ? <span className="db-tab-pending" data-tip="コミットしていない変更があります" aria-label="コミットしていない変更があります" /> : null;
}

/** テーブルのタブに保存していない変更があれば、名前の後ろに「保存していない」印（flagKey: unsavedKey） */
function UnsavedMark({ flagKey }: { flagKey: string }) {
  const unsaved = unsavedTables.useFlag(flagKey);
  return unsaved ? <span className="db-tab-pending" data-tip="保存していない変更があります" aria-label="保存していない変更があります" /> : null;
}

/** タブの名前（ER 図はまわりを見ているテーブル、なければ場所。手順ノートはノートの名前） */
const tabLabel = (t: DbClientTab) => {
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
const tabTitle = (t: DbClientTab, c: DbConnection | undefined) =>
  [c ? `${c.name}（${DB_ENVIRONMENT_LABELS[c.environment]}）` : "", tabWhat(t)].filter(Boolean).join(" › ");

/**
 * タブの上のパンくず。狭い所では押すと接続の一覧を重ねて出す。広い幅でも、テーブル・関数・列挙型のタブの上には出す
 * （どの接続のどの DB か取り違えないように。一覧は横に見えているので押せない）
 */
export function DbBreadcrumb({ tab, connection, narrow, onOverlay }: { tab: DbClientTab; connection: DbConnection | undefined; narrow: boolean; onOverlay: () => void }) {
  if (narrow) {
    return (
      <button type="button" className="db-breadcrumb small" title="接続の一覧を重ねて出す" onClick={onOverlay}>
        {breadcrumbOf(tab, connection)}
      </button>
    );
  }
  return tab.kind === "table" ? <div className="db-breadcrumb static small">{breadcrumbOf(tab, connection)}</div> : null;
}

/** 狭い所でタブの上に出すパンくず */
function breadcrumbOf(t: DbClientTab, c: DbConnection | undefined): string {
  const rest = t.kind === "sql" ? [t.title] : t.kind === "note" ? ["手順ノート", noteName(t.path)] : [t.path.database, t.path.schema, t.kind === "er" ? "ER 図" : t.name];
  return [c?.name, ...rest].filter(Boolean).join(" › ");
}

/** 右のタブの列（役割と ←→ は土台の useTabs。押すと選ぶ・ダブルクリックで仮のタブを固定・× で閉じる） */
export function DbTabStrip({
  tabs,
  state,
  connectionOf,
  surfaceKey,
  start,
  end,
  onPin,
  onClose,
}: {
  tabs: Tabs<string>;
  state: DbClientTabs;
  connectionOf: (id: number) => DbConnection | undefined;
  surfaceKey: string;
  /** 左端（一覧を出すボタン）・右端（別ウィンドウで開く） */
  start: ReactNode;
  end: ReactNode;
  onPin: (key: string) => void;
  onClose: (tab: DbClientTab) => void;
}) {
  /** タブにいくつもの接続が混ざるとき、タブの名前の前に接続の名前を添える */
  const mixedConnections = new Set(state.tabs.map((t) => t.connection_id)).size > 1;
  return (
    <div className="db-tabs" {...tabs.listProps}>
      {start}
      {state.tabs.map((t) => {
        const c = connectionOf(t.connection_id);
        const preview = t.kind === "table" && t.preview;
        return (
          <div key={t.key} className={cx("db-tab", t.key === state.active && "active", preview && "preview", c && `db-env-${c.environment}`)}>
            <button type="button" className="db-tab-name" {...tabs.tabProps(t.key)} title={preview ? `${tabTitle(t, c)}\n仮のタブ（ダブルクリックで固定）` : tabTitle(t, c)} onDoubleClick={() => onPin(t.key)}>
              <span className="db-env-dot" aria-hidden />
              <DbTabIcon tab={t} />
              {mixedConnections && c && <span className="db-tab-conn">{c.name}</span>}
              <span className="db-tab-label">{tabLabel(t)}</span>
              {t.kind === "sql" && <PendingMark tabKey={t.key} />}
              {t.kind === "table" && <UnsavedMark flagKey={unsavedKey(surfaceKey, t.key)} />}
            </button>
            <CloseButton size="xs" label="タブを閉じる" iconSize={12} className="db-tab-close" onClick={() => onClose(t)} />
          </div>
        );
      })}
      <span className="db-tabs-end">{end}</span>
    </div>
  );
}
