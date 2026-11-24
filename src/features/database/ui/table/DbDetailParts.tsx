import type { ReactNode } from "react";
import { DB_OBJECT_KIND_LABELS, type DbObjectKind } from "@shared/database/types";
import { CopyButton } from "@/foundation/ui/kit/CopyButton";
import { HighlightedCode } from "@/foundation/ui/kit/HighlightedCode";

/** テーブル・関数・列挙型のタブの見出しの行（名前・種類と、その後ろの操作） */
export function DbViewHead({ label, kind, children }: { label: string; kind: DbObjectKind; children: ReactNode }) {
  return (
    <div className="db-view-head bar">
      <span className="db-view-title" title={label}>
        {label}
      </span>
      <span className="db-view-kind">{DB_OBJECT_KIND_LABELS[kind]}</span>
      {children}
    </div>
  );
}

/** 項目と値の 2 列の表（情報・関数の引数など） */
export function DbInfoTable({ rows }: { rows: [string, string][] }) {
  return (
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
  );
}

/** 作る文（DDL）とコピーのボタン。読めなければ missing の文 */
export function DbDdlBlock({ ddl, missing, className }: { ddl: string | null; missing: string; className: string }) {
  return (
    <div className={className}>
      {ddl ? (
        <>
          <CopyButton label="DDL をコピー" text={ddl} className="db-ddl-copy" />
          <pre>
            <HighlightedCode code={ddl} lang="sql" />
          </pre>
        </>
      ) : (
        <p className="muted small">{missing}</p>
      )}
    </div>
  );
}
