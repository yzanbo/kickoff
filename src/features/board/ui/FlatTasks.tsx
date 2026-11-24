import "./FlatTasks.css";
import type { ReactNode } from "react";
import type { Chat } from "@shared/chat/types";
import { ArchivableItems } from "@/features/chatList/ui";
import { DraftCards } from "./DraftCards";
import type { PlacedDraft } from "@/features/chatPanel/ui";

/**
 * 状態で分けない並び（全プロジェクトのボードの「列: 分けない」。段に分けたときは段ごと）。
 * 下書き → チャット（最後に動いた順。chats は bucketChats のまとまりの並びのまま）を、作業中・回答待ち・未読・既読で分けずに 1 つに並べ、
 * アーカイブ済みはいちばん下の閉じたまとまりにする。list でなければカードを幅に合わせて何列にも折り返し、list なら 1 列の行
 */
export function FlatTasks({
  chats,
  drafts,
  list,
  showDraftProject,
  foldPlace,
  archivedKey,
  render,
}: {
  chats: readonly Chat[];
  drafts: readonly PlacedDraft[];
  list: boolean;
  /** 下書きにプロジェクトのバッジを付ける（全プロジェクトのボード） */
  showDraftProject?: boolean;
  /** アーカイブ済みのまとまりの開閉を覚える場所（ボード）とキー（段ごと） */
  foldPlace: string;
  archivedKey: string;
  /** カード（ボード）・行（リスト）の描き方 */
  render: (chat: Chat) => ReactNode;
}) {
  const items = list ? "flat-tasks-items" : "flat-tasks-items flat-tasks-grid";
  return (
    <section className={list ? "flat-tasks list-group" : "flat-tasks"}>
      <ArchivableItems
        items={chats}
        render={render}
        lead={<DraftCards drafts={drafts} showProject={showDraftProject} />}
        leadCount={drafts.length}
        empty={<p className="empty-note column-empty">なし</p>}
        wrap={items}
        foldPlace={foldPlace}
        foldKey={archivedKey}
        foldClass={`archived-fold ${items}`}
      />
    </section>
  );
}
