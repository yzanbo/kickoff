import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Eye, KeyRound, Link, Table2 } from "lucide-react";
import { memo } from "react";
import type { DbErTable } from "@shared/types";
import { cx } from "@/lib/cx";

/** 箱に渡すもの（columns は出す列。keyColumns は線をつなぐ列（左右に見えない取っ手を置く）） */
export type ErNodeData = {
  table: DbErTable;
  columns: DbErTable["columns"];
  fkColumns: ReadonlySet<string>;
  keyColumns: ReadonlySet<string>;
  /** 乗せたテーブルとつながっていて強く見せる / つながっていなくて薄く見せる */
  tone: "focus" | "near" | "dim" | null;
  /** まわりを見ている中心のテーブル */
  center: boolean;
};

export type ErNode = Node<ErNodeData, "erTable">;

/** 線の端の取っ手（左右・列ごと。見えない。列を出さないときは見出しに 1 つ） */
function Sides({ id }: { id: string }) {
  return (
    <>
      <Handle type="source" position={Position.Left} id={`l:${id}`} className="db-er-handle" isConnectable={false} />
      <Handle type="source" position={Position.Right} id={`r:${id}`} className="db-er-handle" isConnectable={false} />
    </>
  );
}

/** ER 図のテーブルの箱: 見出し（ビューは目のアイコン）と列（主キーは琥珀の鍵・外部キーはつなぐ印・型・NOT NULL でなければ「?」） */
export const ErTableNode = memo(function ErTableNode({ data }: NodeProps<ErNode>) {
  const { table, columns, fkColumns, keyColumns, tone, center } = data;
  const Icon = table.kind === "view" ? Eye : Table2;
  return (
    <div className={cx("db-er-node", tone && `tone-${tone}`, center && "center", table.kind === "view" && "view")} title={table.comment ?? undefined}>
      <div className="db-er-node-head">
        <Icon size={12} aria-hidden />
        <span className="db-er-node-name">{table.name}</span>
        {/* 列を出さないときは見出しに線をつなぐ */}
        <Sides id="" />
      </div>
      {columns.length > 0 && (
        <ul className="db-er-node-cols">
          {columns.map((c) => (
            <li key={c.name} className="db-er-col">
              <span className="db-er-col-mark" aria-hidden>
                {c.primary_key ? <KeyRound size={11} className="db-tree-pk" /> : fkColumns.has(c.name) ? <Link size={11} /> : null}
              </span>
              <span className="db-er-col-name">{c.name}</span>
              <span className="db-er-col-type">
                {c.type}
                {c.nullable && !c.primary_key ? "?" : ""}
              </span>
              {keyColumns.has(c.name) && <Sides id={c.name} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
