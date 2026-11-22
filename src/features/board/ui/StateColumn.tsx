import type { ReactNode } from "react";
import type { Chat } from "@shared/chat/types";
import type { ChatBucket } from "@/features/chatList/ui/buckets";
import { bucketTone } from "@/features/chatList/ui/StateChatsPopover";
import { bucketMark } from "@/features/chatList/ui/StateChip";
import { DRAFT_LOOK } from "@shared/chat/stateLooks";
import { ArchiveAllButton } from "./ArchiveAllButton";
import { ArchivedFold } from "@/foundation/ui/kit/ArchivedFold";
import { activeOf, ArchivableItems, archivedOf, ColumnBody } from "@/features/chatList/ui";
import { ColumnHead } from "./ColumnHead";
import { DraftCards } from "./DraftCards";
import type { PlacedDraft } from "@/features/chatPanel/ui/drafts/panelDrafts";
import { RowBudgetScope, useRowBudgets } from "@/foundation/ui/hooks/useProgressiveRows";
import { ProgressiveItems } from "@/foundation/ui/kit/ProgressiveRows";

/** カード（ボード）・行（リスト）の描き方 */
type RenderChat = (chat: Chat) => ReactNode;

/**
 * 状態の列 1 本（作業中・回答待ち・未読・既読。bucketChats の状態のまとまり。カンバン・スイムレーンの段で共通）。
 * アーカイブ済みは列のいちばん下の閉じたまとまりに分け（サイドバーと同じ）、見出しの件数はアーカイブしていないものだけ。
 * 既読の列には、すべてアーカイブするボタン。list のときはリストのまとまり（カードの囲いなし）
 */
export function StateColumn({
  column,
  foldPlace,
  render,
  list = false,
  foldArchived = true,
}: {
  column: ChatBucket<PlacedDraft>;
  /** アーカイブ済みのまとまりの開閉を覚える場所（ボード。列は列のまとまりのキーで分ける） */
  foldPlace?: string;
  render: RenderChat;
  list?: boolean;
  /** アーカイブ済みを列のいちばん下に畳んで出す（リスト表示では、最後の ArchivedListSection にまとめるので出さない） */
  foldArchived?: boolean;
}) {
  const active = activeOf(column.chats);
  return (
    <section className={list ? "list-group" : "board-column"}>
      <ColumnHead label={column.label} tone={bucketTone(column)} mark={bucketMark(column, active)} count={active.length} action={column.column === "read" ? <ArchiveAllButton chats={active} /> : undefined} />
      <ColumnBody list={list}>
        <ArchivableItems items={column.chats} render={render} empty={<p className="empty-note column-empty">なし</p>} fold={foldArchived} foldPlace={foldPlace} foldKey={`${column.key}/archived`} />
      </ColumnBody>
    </section>
  );
}

/**
 * いちばん左の「下書き」の列（まだ送っていない新しいチャット。AI はまだ何もしていない）。
 * 新しいチャットは見出しの「新規」から始めるので、列に＋は置かない。showProject: 下書きにプロジェクトのバッジを付ける（全プロジェクトのボード）
 */
function DraftColumn({ drafts, list = false, showProject = false }: { drafts: readonly PlacedDraft[]; list?: boolean; showProject?: boolean }) {
  return (
    <section className={list ? "list-group" : "board-column"}>
      <ColumnHead label={DRAFT_LOOK.label} tone={DRAFT_LOOK.tone} count={drafts.length} />
      <ColumnBody list={list}>
        <DraftCards drafts={drafts} showProject={showProject} />
        {drafts.length === 0 && <p className="empty-note column-empty">なし</p>}
      </ColumnBody>
    </section>
  );
}

/**
 * ボードの列: いちばん左に下書き、続けて状態の列（columns は bucketChats の状態のまとまり。ボードと段の中で共通）。
 * アーカイブ済みのまとまりの開閉は、foldPlace（ボード）と列のキーで覚える。showDraftProject: 下書きにプロジェクトのバッジを付ける（全プロジェクトのボード）
 */
export function StateColumns({
  columns,
  drafts,
  showDraftProject,
  foldPlace,
  render,
}: {
  columns: readonly ChatBucket<PlacedDraft>[];
  drafts: readonly PlacedDraft[];
  showDraftProject?: boolean;
  foldPlace: string;
  render: RenderChat;
}) {
  return (
    <>
      <DraftColumn drafts={drafts} showProject={showDraftProject} />
      {columns.map((c) => (
        <StateColumn key={c.key} column={c} foldPlace={foldPlace} render={render} />
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
  showDraftProject,
  foldPlace,
  archivedKey,
  render,
}: {
  columns: readonly ChatBucket<PlacedDraft>[];
  drafts: readonly PlacedDraft[];
  /** 下書きにプロジェクトのバッジを付ける（全プロジェクトのボード） */
  showDraftProject?: boolean;
  foldPlace: string;
  archivedKey: string;
  render: RenderChat;
}) {
  // 最初に描く行の上限（hooks/useProgressiveRows.ts）を、縦に並ぶまとまりの上から順に配る
  const budgets = useRowBudgets(columns.map((c) => activeOf(c.chats).length));
  return (
    <>
      <DraftColumn drafts={drafts} list showProject={showDraftProject} />
      {columns.map((c, i) => (
        <RowBudgetScope key={c.key} value={budgets[i]}>
          <StateColumn column={c} render={render} list foldArchived={false} />
        </RowBudgetScope>
      ))}
      <ArchivedListSection columns={columns} foldPlace={foldPlace} foldKey={archivedKey} render={render} />
    </>
  );
}

/**
 * リスト表示のいちばん下の「アーカイブ済み」（初めは閉じていて、押すと開く）。中は、アーカイブしていないものと同じく
 * 状態ごと（作業中・回答待ち・未読・既読）に分けて並べる。下書きはアーカイブできないので分けない
 */
function ArchivedListSection({ columns, foldPlace, foldKey, render }: { columns: readonly ChatBucket<PlacedDraft>[]; foldPlace: string; foldKey: string; render: RenderChat }) {
  const count = columns.reduce((n, c) => n + archivedOf(c.chats).length, 0);
  if (count === 0) return null;
  return (
    <section className="list-group archived-list">
      <ArchivedFold place={foldPlace} foldKey={foldKey} count={count} bodyClassName="archived-fold">
        {columns.map((c) => {
          const list = archivedOf(c.chats);
          return (
            <div key={c.key} className="archived-list-state">
              <ColumnHead label={c.label} tone={bucketTone(c)} mark={bucketMark(c)} count={list.length} />
              {list.length === 0 ? <p className="empty-note column-empty">なし</p> : <ProgressiveItems items={list} render={render} />}
            </div>
          );
        })}
      </ArchivedFold>
    </section>
  );
}
