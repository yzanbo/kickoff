import type { ReactNode } from "react";
import type { Chat } from "@shared/types";
import { ArchivedFold, splitArchived } from "@/ui/ArchivedFold";
import type { PanelDraft } from "@/features/panel/state/panelDrafts";
import { DraftCards } from "./DraftCards";

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
  drafts: readonly PanelDraft[];
  list: boolean;
  /** 下書きにプロジェクトのバッジを付ける（全プロジェクトのボード） */
  showDraftProject?: boolean;
  /** アーカイブ済みのまとまりの開閉を覚える場所（ボード）とキー（段ごと） */
  foldPlace: string;
  archivedKey: string;
  /** カード（ボード）・行（リスト）の描き方 */
  render: (chat: Chat) => ReactNode;
}) {
  const [active, archived] = splitArchived(chats);
  const items = list ? "flat-tasks-items" : "flat-tasks-items flat-tasks-grid";
  return (
    <section className={list ? "flat-tasks list-group" : "flat-tasks"}>
      {drafts.length === 0 && active.length === 0 ? (
        <p className="column-empty">なし</p>
      ) : (
        <div className={items}>
          <DraftCards drafts={drafts} showProject={showDraftProject} />
          {active.map(render)}
        </div>
      )}
      <ArchivedFold place={foldPlace} foldKey={archivedKey} count={archived.length} bodyClassName={`archived-fold ${items}`}>
        {archived.map(render)}
      </ArchivedFold>
    </section>
  );
}
