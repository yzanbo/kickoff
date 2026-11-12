import { ArrowUpRight, CornerDownLeft, KeyRound, Link } from "lucide-react";
import type { DbColumnInfo, DbTableDetail, DbValue } from "@shared/types";
import { isDbBinary, isDbLongText } from "@shared/database/dbValue";
import { cx } from "@/lib/cx";
import { CloseButton } from "@/ui/IconButton";
import { CopyButton } from "@/ui/CopyButton";
import { detailText, foreignKeysByColumn, linkFilters } from "./dbRowTools";
import type { RowLink } from "./TableData";

/** 頭だけの長い文字の添え書き（残りは TableData が読み直す。キーの列がなければ読めない） */
function longNote(value: DbValue): string {
  return isDbLongText(value) ? `全体 ${value.chars.toLocaleString()} 文字のうち、頭の ${value.head.length.toLocaleString()} 文字だけです（残りを読んでいます。行を指す列がない表では読めません）` : "";
}

/**
 * 行の詳細（選んだセルの行を縦に並べる。JSON は整え、空文字・NULL・バイナリは分かる形に）。
 * 外部キーの列には参照先の行へ移るボタン、下にこの行を指しているテーブル（主キーなどの値で探す）
 */
export function TableRowDetail({
  columns,
  row,
  index,
  detail,
  onLink,
  onClose,
}: {
  columns: DbColumnInfo[];
  row: DbValue[];
  index: number;
  detail: DbTableDetail | undefined;
  onLink: (link: RowLink) => void;
  onClose: () => void;
}) {
  const fks = foreignKeysByColumn(detail?.foreign_keys ?? []);
  const pk = new Set(detail?.columns.filter((c) => c.primary_key).map((c) => c.name) ?? []);
  const referenced = (detail?.referenced_by ?? [])
    .map((r) => ({ ref: r, filters: linkFilters(row, columns, r.ref_columns, r.columns) }))
    .filter((x): x is { ref: (typeof x)["ref"]; filters: NonNullable<(typeof x)["filters"]> } => x.filters !== null);

  return (
    <aside className="db-row-detail" aria-label="行の詳細">
      <div className="db-row-detail-head">
        <span className="db-row-detail-title">{index + 1} 行目</span>
        <CloseButton label="行の詳細を閉じる" size={14} onClick={onClose} />
      </div>
      <dl className="db-row-detail-list">
        {columns.map((c, i) => {
          const shown = detailText(row[i]);
          const links = (fks.get(c.name) ?? []).flatMap((fk) => {
            const filters = linkFilters(row, columns, fk.columns, fk.ref_columns);
            return filters ? [{ fk, filters }] : [];
          });
          return (
            <div key={c.name} className="db-row-detail-item">
              <dt>
                {pk.has(c.name) ? <KeyRound size={11} className="db-tree-pk" aria-hidden /> : fks.has(c.name) ? <Link size={11} aria-hidden /> : null}
                <span className="db-row-detail-name">{c.name}</span>
                {c.type && <span className="db-row-detail-type">{c.type}</span>}
                {shown.kind !== "null" && shown.kind !== "binary" && shown.kind !== "long" && <CopyButton label={`${c.name} の値をコピー`} size={11} text={String(row[i])} className="db-row-detail-copy" />}
              </dt>
              <dd>
                <pre className={cx("db-row-detail-value", `kind-${shown.kind}`)}>{shown.text}</pre>
                {shown.kind === "long" && <p className="small muted">{longNote(row[i])}</p>}
                {isDbBinary(row[i]) && row[i].data_url && <img className="db-row-detail-image" src={row[i].data_url} alt={`${c.name} の画像`} />}
                {links.map(({ fk, filters }) => (
                  <button
                    key={`${fk.ref_table}:${fk.columns.join(",")}`}
                    type="button"
                    className="link-button small db-row-detail-link"
                    onClick={() => onLink({ schema: fk.ref_schema, table: fk.ref_table, filters })}
                  >
                    <ArrowUpRight size={11} aria-hidden /> {fk.ref_table} の行を開く
                  </button>
                ))}
              </dd>
            </div>
          );
        })}
      </dl>
      {referenced.length > 0 && (
        <div className="db-row-detail-refs">
          <h4 className="small muted">この行を指しているもの</h4>
          {referenced.map(({ ref, filters }) => (
            <button
              key={`${ref.schema ?? ""}.${ref.table}:${ref.columns.join(",")}`}
              type="button"
              className="link-button small db-row-detail-link"
              onClick={() => onLink({ schema: ref.schema, table: ref.table, filters })}
            >
              <CornerDownLeft size={11} aria-hidden /> {ref.table}（{ref.columns.join(", ")}）
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
