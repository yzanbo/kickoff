import type { ReactNode } from "react";
import { BOARD_COLUMN_LABELS, type BoardColumn } from "../../../../core/types";
import { ArchiveAllButton } from "./ArchiveAllButton";
import { ArchivedFold, splitArchived } from "./ArchivedFold";
import type { BoardEntry } from "./boardColumns";
import { ColumnHead } from "./ColumnHead";
import { COLUMN_TONE, DRAFT_TONE } from "./tones";

/**
 * 状態の列 1 本（作業中・回答待ち・未読・既読。カンバン・スイムレーンの段で共通）。
 * アーカイブ済みは列のいちばん下の閉じたまとまりに分け（サイドバーと同じ）、見出しの件数はアーカイブしていないものだけ。
 * 既読の列には、すべてアーカイブするボタン。list のときはリストのまとまり（カードの囲いなし）
 */
export function StateColumn({
  column,
  entries,
  foldKey,
  render,
  list = false,
}: {
  column: BoardColumn;
  entries: BoardEntry[];
  /** アーカイブ済みのまとまりの開閉を覚える名前（ボード・段・列ごと） */
  foldKey: string;
  /** カード（ボード）・行（リスト）の描き方 */
  render: (entry: BoardEntry) => ReactNode;
  list?: boolean;
}) {
  const [active, archived] = splitArchived(entries, (e) => e.run);
  const body = (
    <>
      {active.length === 0 && <p className="column-empty">なし</p>}
      {active.map(render)}
      <ArchivedFold foldKey={foldKey} count={archived.length}>
        {archived.map(render)}
      </ArchivedFold>
    </>
  );
  return (
    <section className={list ? "list-group" : "board-column"}>
      <ColumnHead
        label={BOARD_COLUMN_LABELS[column]}
        tone={COLUMN_TONE[column]}
        count={active.length}
        action={column === "done" ? <ArchiveAllButton runs={active.map((e) => e.run)} /> : undefined}
      />
      {list ? body : <div className="column-cards">{body}</div>}
    </section>
  );
}

/**
 * いちばん左の「下書き」の列（まだ送っていない新しいチャット。AI はまだ何もしていない）。
 * children は下書きのカード（DraftCards）。新しいチャットは見出しの「新規」から始めるので、列に＋は置かない
 */
export function DraftColumn({ count, list = false, children }: { count: number; list?: boolean; children: ReactNode }) {
  const body = (
    <>
      {children}
      {count === 0 && <p className="column-empty">なし</p>}
    </>
  );
  return (
    <section className={list ? "list-group" : "board-column"}>
      <ColumnHead label="下書き" tone={DRAFT_TONE} count={count} />
      {list ? body : <div className="column-cards">{body}</div>}
    </section>
  );
}
