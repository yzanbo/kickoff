import type { ReactNode } from "react";
import type { Chat } from "@shared/types";
import type { ChatBucket } from "@/features/chatList/buckets";
import { bucketTone } from "@/features/chatList/StateChatsPopover";
import { DRAFT_TONE } from "@/features/chat/tones";
import { ArchiveAllButton } from "./ArchiveAllButton";
import { ArchivedFold, splitArchived } from "./ArchivedFold";
import { ColumnHead } from "./ColumnHead";
import { DraftCards, type BoardDraft } from "./DraftCards";

/** カード（ボード）・行（リスト）の描き方 */
type RenderChat = (chat: Chat) => ReactNode;

/**
 * 状態の列 1 本（作業中・回答待ち・未読・既読。bucketChats の状態のまとまり。カンバン・スイムレーンの段で共通）。
 * アーカイブ済みは列のいちばん下の閉じたまとまりに分け（サイドバーと同じ）、見出しの件数はアーカイブしていないものだけ。
 * 既読の列には、すべてアーカイブするボタン。list のときはリストのまとまり（カードの囲いなし）
 */
export function StateColumn({
  column,
  foldKey,
  render,
  list = false,
  foldArchived = true,
}: {
  column: ChatBucket<BoardDraft>;
  /** アーカイブ済みのまとまりの開閉を覚える名前（ボード・段・列ごと） */
  foldKey?: string;
  render: RenderChat;
  list?: boolean;
  /** アーカイブ済みを列のいちばん下に畳んで出す（リスト表示では、最後の ArchivedListSection にまとめるので出さない） */
  foldArchived?: boolean;
}) {
  const [active, archived] = splitArchived(column.chats);
  const body = (
    <>
      {active.length === 0 && <p className="column-empty">なし</p>}
      {active.map(render)}
      {foldArchived && foldKey && (
        <ArchivedFold foldKey={foldKey} count={archived.length}>
          {archived.map(render)}
        </ArchivedFold>
      )}
    </>
  );
  return (
    <section className={list ? "list-group" : "board-column"}>
      <ColumnHead label={column.label} tone={bucketTone(column)} count={active.length} action={column.column === "read" ? <ArchiveAllButton chats={active} /> : undefined} />
      {list ? body : <div className="column-cards">{body}</div>}
    </section>
  );
}

/**
 * いちばん左の「下書き」の列（まだ送っていない新しいチャット。AI はまだ何もしていない）。
 * 新しいチャットは見出しの「新規」から始めるので、列に＋は置かない
 */
export function DraftColumn({ drafts, list = false }: { drafts: readonly BoardDraft[]; list?: boolean }) {
  const body = (
    <>
      <DraftCards drafts={drafts} />
      {drafts.length === 0 && <p className="column-empty">なし</p>}
    </>
  );
  return (
    <section className={list ? "list-group" : "board-column"}>
      <ColumnHead label="下書き" tone={DRAFT_TONE} count={drafts.length} />
      {list ? body : <div className="column-cards">{body}</div>}
    </section>
  );
}

/**
 * ボードの列: いちばん左に下書き、続けて状態の列（columns は bucketChats の状態のまとまり。ボードと段の中で共通）。
 * アーカイブ済みのまとまりの開閉は、foldScope（ボード）と列のキーで覚える
 */
export function StateColumns({ columns, drafts, foldScope, render }: { columns: readonly ChatBucket<BoardDraft>[]; drafts: readonly BoardDraft[]; foldScope: string; render: RenderChat }) {
  return (
    <>
      <DraftColumn drafts={drafts} />
      {columns.map((c) => (
        <StateColumn key={c.key} column={c} foldKey={`${foldScope}:${c.key}/archived`} render={render} />
      ))}
    </>
  );
}

/**
 * リスト表示のまとまり: 下書き → 状態ごと → いちばん下にアーカイブ済み（中を状態ごとに分ける）。段に分けるときは段ごと。
 * archivedKey はいちばん下のアーカイブ済みの開閉を覚えるキー（ボードの中で、段ごと）
 */
export function ListSections({
  columns,
  drafts,
  foldScope,
  archivedKey,
  render,
}: {
  columns: readonly ChatBucket<BoardDraft>[];
  drafts: readonly BoardDraft[];
  foldScope: string;
  archivedKey: string;
  render: RenderChat;
}) {
  return (
    <>
      <DraftColumn drafts={drafts} list />
      {columns.map((c) => (
        <StateColumn key={c.key} column={c} render={render} list foldArchived={false} />
      ))}
      <ArchivedListSection columns={columns} foldKey={`${foldScope}:${archivedKey}`} render={render} />
    </>
  );
}

/**
 * リスト表示のいちばん下の「アーカイブ済み」（初めは閉じていて、押すと開く）。中は、アーカイブしていないものと同じく
 * 状態ごと（作業中・回答待ち・未読・既読）に分けて並べる。下書きはアーカイブできないので分けない
 */
function ArchivedListSection({ columns, foldKey, render }: { columns: readonly ChatBucket<BoardDraft>[]; foldKey: string; render: RenderChat }) {
  const archivedOf = (c: ChatBucket<BoardDraft>) => splitArchived(c.chats)[1];
  const count = columns.reduce((n, c) => n + archivedOf(c).length, 0);
  if (count === 0) return null;
  return (
    <section className="list-group archived-list">
      <ArchivedFold foldKey={foldKey} count={count}>
        {columns.map((c) => {
          const list = archivedOf(c);
          return (
            <div key={c.key} className="archived-list-state">
              <ColumnHead label={c.label} tone={bucketTone(c)} count={list.length} />
              {list.length === 0 ? <p className="column-empty">なし</p> : list.map(render)}
            </div>
          );
        })}
      </ArchivedFold>
    </section>
  );
}
