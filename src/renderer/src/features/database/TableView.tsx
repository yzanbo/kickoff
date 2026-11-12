import { useEffect, useMemo, useState } from "react";
import { DB_OBJECT_KIND_LABELS, type DbConnection, type DbForeignKey, type DbRowFilter, type DbTableDetail } from "@shared/types";
import { api } from "@/api";
import { useAsync } from "@/hooks/useAsync";
import { cx } from "@/lib/cx";
import { isKey } from "@/lib/keys";
import { formatBytes } from "@/lib/format";
import type { DbTableTab } from "@/lib/dbClientTabs";
import { CopyButton } from "@/ui/CopyButton";
import { ErrorText } from "@/ui/ErrorText";
import { HighlightedCode } from "@/ui/HighlightedCode";
import { RefreshButton } from "@/ui/IconButton";
import { Segmented } from "@/ui/Segmented";
import { AskAiButton, OpenAsSqlButton } from "./DbAiButtons";
import { useDbClient } from "./dbClientContext";
import { objectPathLabel } from "./dbFormat";
import { DbWriteBand } from "./DbWriteBand";
import { TableData } from "./TableData";
import { useTableRows } from "./useTableRows";
import { estimateRowsBytes, useResultBudget } from "./resultBudget";
import { useTableEdits } from "./useTableEdits";

type View = "data" | "structure" | "relations" | "ddl" | "info";
const VIEWS: { value: View; label: string }[] = [
  { value: "data", label: "データ" },
  { value: "structure", label: "構造" },
  { value: "relations", label: "リレーション" },
  { value: "ddl", label: "DDL" },
  { value: "info", label: "情報" },
];

/**
 * テーブル・ビューのタブ（データ / 構造 / リレーション / DDL / 情報）。データは 100 行ずつ読み（続きは「さらに読む」）、列の見出しで並べ替え（ORDER BY を付けて取り直す）、
 * 絞り込みはタブに覚える（onFilter）。全体の行数は統計の推定で出し、「正確に数える」を押したときだけ COUNT(*) を流す。
 * セルの書き換えなどの保存していない変更は、表示を切り替えても残るようここで持ち（useTableEdits）、⌘S で保存する
 */
export function TableView({
  tab,
  connection,
  active,
  onFilter,
}: {
  tab: DbTableTab;
  connection: DbConnection;
  /** いま見ているタブか（裏のタブの結果は多すぎれば捨て、戻ったら取り直す） */
  active: boolean;
  onFilter: (filter: DbRowFilter | null) => void;
}) {
  const client = useDbClient();
  const worktree = client.worktreeOf(connection.id);
  const [view, setView] = useState<View>("data");
  const detail = useAsync(() => api.dbTable(client.projectId, connection.id, tab.path, tab.name, worktree), [connection.id, tab.key, worktree]);
  const data = useTableRows(tab, connection, worktree);
  const edit = useTableEdits(tab, connection, detail.data, worktree, data.reload);
  // 保存していない変更があるタブの結果は捨てない（変更は読んだ行に重ねて見せるため）
  const bytes = useMemo(() => (data.result && edit.counts.total === 0 ? estimateRowsBytes(data.result.rows) : 0), [data.result, edit.counts.total]);
  useResultBudget(`${client.place}:${tab.key}`, bytes, active, data.evict);
  useEffect(() => {
    if (active && data.evicted) data.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, data.evicted]);
  const label = objectPathLabel(tab.path, tab.name);

  return (
    <div
      className={cx("db-table-view", edit.write.on && "writing")}
      onKeyDown={(e) => {
        if (!isKey(e, "s", { meta: true }) && !isKey(e, "s", { ctrl: true })) return;
        e.preventDefault();
        void edit.save();
      }}
    >
      {edit.write.on && <DbWriteBand connection={connection} what="保存する" blocked={edit.saving ? "保存し終わってから戻せます" : null} onRevert={edit.write.revert} />}
      <div className="db-view-head">
        <span className="db-view-title" title={label}>
          {label}
        </span>
        <span className="db-view-kind">{DB_OBJECT_KIND_LABELS[tab.object]}</span>
        <Segmented className="segmented db-view-switch" label="表示" value={view} options={VIEWS} onChange={setView} />
        <span className="db-view-actions">
          <AskAiButton connection={connection} path={tab.path} tables={[tab.name]} />
          <OpenAsSqlButton connection={connection} tab={tab} filter={data.filter} sort={data.sort} />
        </span>
        <RefreshButton
          label="取り直す"
          busy={detail.loading || data.loading}
          onClick={() => {
            detail.reload();
            data.reload();
          }}
        />
      </div>
      <ErrorText message={detail.error} />
      {view === "data" && <TableData data={data} detail={detail.data} connection={connection} tab={tab} worktree={worktree} edit={edit} onFilter={onFilter} />}
      {view === "structure" && detail.data && <TableStructure detail={detail.data} />}
      {view === "relations" && detail.data && <TableRelations detail={detail.data} />}
      {view === "ddl" && detail.data && (
        <div className="db-ddl">
          {detail.data.ddl ? (
            <>
              <CopyButton label="DDL をコピー" text={detail.data.ddl} className="db-ddl-copy" />
              <pre>
                <HighlightedCode code={detail.data.ddl} lang="sql" />
              </pre>
            </>
          ) : (
            <p className="muted small">この DB からは作る文を読めませんでした</p>
          )}
        </div>
      )}
      {view === "info" && detail.data && <TableInfo detail={detail.data} label={label} />}
    </div>
  );
}

function TableStructure({ detail }: { detail: DbTableDetail }) {
  return (
    <div className="db-detail">
      <h3 className="db-detail-head">列（{detail.columns.length}）</h3>
      <table className="db-detail-table">
        <thead>
          <tr>
            <th>名前</th>
            <th>型</th>
            <th>NULL</th>
            <th>既定値</th>
            <th>説明</th>
          </tr>
        </thead>
        <tbody>
          {detail.columns.map((c) => (
            <tr key={c.name}>
              <td>
                {c.name}
                {c.primary_key && <span className="db-pk"> 主キー</span>}
              </td>
              <td className="db-mono">{c.type}</td>
              <td>{c.nullable ? "可" : "不可"}</td>
              <td className="db-mono">{c.default ?? ""}</td>
              <td>{c.comment ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="db-detail-head">インデックス（{detail.indexes.length}）</h3>
      {detail.indexes.length === 0 ? (
        <p className="muted small">ありません</p>
      ) : (
        <table className="db-detail-table">
          <tbody>
            {detail.indexes.map((i) => (
              <tr key={i.name}>
                <td>{i.name}</td>
                <td className="db-mono">{i.columns.join(", ")}</td>
                <td>{i.primary ? "主キー" : i.unique ? "一意" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3 className="db-detail-head">トリガー（{detail.triggers.length}）</h3>
      {detail.triggers.length === 0 ? (
        <p className="muted small">ありません</p>
      ) : (
        <table className="db-detail-table">
          <tbody>
            {detail.triggers.map((t) => (
              <tr key={t.name}>
                <td>{t.name}</td>
                <td>{[t.timing, t.event].filter(Boolean).join(" ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const fkText = (fk: DbForeignKey) => `${fk.columns.join(", ")} → ${fk.ref_schema ? `${fk.ref_schema}.` : ""}${fk.ref_table}(${fk.ref_columns.join(", ")})`;

function TableRelations({ detail }: { detail: DbTableDetail }) {
  return (
    <div className="db-detail">
      <h3 className="db-detail-head">このテーブルから指す（外部キー {detail.foreign_keys.length}）</h3>
      {detail.foreign_keys.length === 0 ? (
        <p className="muted small">ありません</p>
      ) : (
        <ul className="db-relations">
          {detail.foreign_keys.map((fk, i) => (
            <li key={i} className="db-mono">
              {fkText(fk)}
              {fk.on_delete && fk.on_delete !== "NO ACTION" && <span className="muted"> · 削除時 {fk.on_delete}</span>}
            </li>
          ))}
        </ul>
      )}
      <h3 className="db-detail-head">このテーブルを指す（{detail.referenced_by.length}）</h3>
      {detail.referenced_by.length === 0 ? (
        <p className="muted small">ありません</p>
      ) : (
        <ul className="db-relations">
          {detail.referenced_by.map((fk, i) => (
            <li key={i} className="db-mono">
              {fk.schema ? `${fk.schema}.` : ""}
              {fk.table}({fk.columns.join(", ")}) → ({fk.ref_columns.join(", ")})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TableInfo({ detail, label }: { detail: DbTableDetail; label: string }) {
  const rows: [string, string][] = [
    ["名前", label],
    ["種類", DB_OBJECT_KIND_LABELS[detail.kind]],
    ["列の数", String(detail.columns.length)],
    ["行の数（推定）", detail.estimated_rows != null ? detail.estimated_rows.toLocaleString() : "分かりません"],
    ["大きさ", detail.size_bytes != null ? formatBytes(detail.size_bytes) : "分かりません"],
    ["説明", detail.comment ?? ""],
  ];
  return (
    <div className="db-detail">
      <table className="db-detail-table db-info-table">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
