import { Pin } from "lucide-react";
import type { ReactNode } from "react";
import type { Chat } from "@shared/types";
import type { ChatBucket } from "@/features/chatList/buckets";
import type { PanelDraft } from "@/features/panel/state/panelDrafts";
import { RowBudgetScope, useRowBudgets } from "@/hooks/useProgressiveRows";
import { ChatRowList } from "./ChatRowList";
import { DraftRows } from "./DraftRows";

/** グループ・作業場所の中身。固定したチャットと下書きを小見出しの下にまとめ、通常の行はその後ろに並べる */
export function BucketChatRows({
  chats,
  drafts = [],
  sections,
  renderRow,
  renderSections,
}: {
  chats: readonly Chat[];
  drafts?: readonly PanelDraft[];
  sections?: readonly ChatBucket[];
  renderRow: (chat: Chat) => ReactNode;
  renderSections?: (sections: readonly ChatBucket[]) => ReactNode;
}) {
  const pinnedChats = chats.filter((c) => c.pinned && !c.archived_at);
  const regularChats = chats.filter((c) => !c.pinned || c.archived_at);
  const pinnedDrafts = drafts.filter((d) => d.pinned);
  const regularDrafts = drafts.filter((d) => !d.pinned);
  // 状態順でも「固定」はここで一度だけ描く（元の children にある「固定」は重ねない）
  const regularSections = sections?.filter((b) => b.kind !== "pinned");
  const hasPinned = pinnedChats.length > 0 || pinnedDrafts.length > 0;
  const hasRegular = regularChats.length > 0 || regularDrafts.length > 0;
  // 一覧を二つに分けても、最初に描く行の上限は元のまとまりで一つ
  const [pinnedBudget, regularBudget] = useRowBudgets([pinnedChats.length, regularChats.length]);
  return (
    <>
      {hasPinned && (
        <section className="sidebar-pinned-list" aria-label="固定したチャット">
          <div className="sidebar-pinned-head">
            <Pin size={12} aria-hidden />
            <span>固定</span>
          </div>
          <DraftRows drafts={pinnedDrafts} />
          {pinnedChats.length > 0 && (
            <RowBudgetScope value={pinnedBudget}>
              <ChatRowList chats={pinnedChats} renderRow={renderRow} />
            </RowBudgetScope>
          )}
        </section>
      )}
      {hasRegular && (
        <div className={hasPinned ? "sidebar-after-pinned" : undefined}>
          <DraftRows drafts={regularDrafts} />
          <RowBudgetScope value={regularBudget}>
            {regularSections && renderSections ? renderSections(regularSections) : regularChats.length > 0 ? (
              <ChatRowList chats={regularChats} renderRow={renderRow} />
            ) : null}
          </RowBudgetScope>
        </div>
      )}
    </>
  );
}
