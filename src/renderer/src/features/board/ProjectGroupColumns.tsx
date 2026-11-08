import type { ReactNode } from "react";
import type { Chat } from "@shared/types";
import { openNewChat } from "@/app/router";
import { useChatBuckets } from "@/features/chatList/useChatBuckets";
import type { PanelDraft } from "@/features/panel/state/panelDrafts";
import { useGroups } from "@/stores/groups";
import { ErrorText } from "@/ui/ErrorText";
import { GroupCreateForm } from "./GroupCreateForm";
import { GroupSections } from "./GroupSections";
import { useGroupBoard } from "./useGroupBoard";

/**
 * 全プロジェクトのボードの「列: グループ」の、1 つのプロジェクトの段の中身: そのプロジェクトのグループの列（自分で作ったグループ → No Group。
 * チャットのないグループも出す）と、ボードではいちばん右の「グループを作成」の列。部品と操作はプロジェクトのグループのボードと同じ（GroupSections・useGroupBoard）で、
 * カードを列へドラッグするとそのグループへ移し、ほかのプロジェクトのチャットを落とすと確かめてからこのプロジェクトへ移してそのグループに入れる
 * （作業中なら落とせない）。リストの「グループを作成」は段の見出しにある（LaneGroupCreate）。列の見出しのドラッグで並べ替え、名前のダブルクリックで名前を変え、「…」で削除。
 * chats・drafts は全プロジェクトのボードで絞り込んだ（名前の検索・アーカイブ・作業場所）このプロジェクトの分。
 * 列の＋は、そのプロジェクトのボードへ移って、そのグループで新しいチャットを始める（全プロジェクトの画面ではチャットを開かない）
 */
export function ProjectGroupColumns({
  projectId,
  chats,
  drafts,
  list,
  foldPlace,
  render,
}: {
  projectId: number;
  chats: readonly Chat[];
  drafts: readonly PanelDraft[];
  list: boolean;
  /** アーカイブ済みのまとまりの開閉を覚える場所（ボード。グループはまとまりのキーで分ける） */
  foldPlace: string;
  /** カード（ボード）・行（リスト）の描き方 */
  render: (chat: Chat) => ReactNode;
}) {
  const groups = useGroups(projectId);
  // グループの作成・名前の変更・削除・並べ替え・ドロップは、プロジェクトのグループのボードと同じ状態と操作（絞り込みは全プロジェクトのボードのものを使う）
  const board = useGroupBoard({ projectId, groups });
  const buckets = useChatBuckets(chats, { by: "group", project: projectId, drafts, keepEmpty: true });
  return (
    <>
      <GroupSections
        projectId={projectId}
        buckets={buckets}
        board={board}
        onNewChat={(target) => openNewChat(target.projectId, target.group === undefined ? {} : { group: target.group })}
        render={render}
        foldPlace={foldPlace}
        list={list}
      />
      {/* 「グループを作成」は、ボードは右端の列（プロジェクトのグループのボードと同じ）。リストは段の見出しのプロジェクト名の右（KanbanView の LaneGroupCreate） */}
      {!list && (
        <section className="board-column group-add-column">
          <GroupCreateForm board={board} />
        </section>
      )}
      {/* 操作の失敗とグループの「…」メニュー */}
      <ErrorText message={board.error} />
      {board.groupMenu.menu}
    </>
  );
}
