import { CornerDownRight } from "lucide-react";
import type { ReactNode } from "react";
import type { Chat } from "@shared/types";
import { useChatStates } from "@/app/chatStatesContext";
import { cx } from "@/lib/cx";
import { useFold } from "@/hooks/useFold";
import { ArchivedFold, splitArchived } from "@/ui/ArchivedFold";
import { Chevron } from "@/ui/Chevron";
import { Collapse } from "@/ui/Collapse";

/**
 * サイドバーの親のチャットの下の子チャット（フォルダと同じく開閉する。初めは閉じる）。開閉の行に子の数と、子のどれかが回答待ち・未読なら点を出す。
 * 開くと子の行を 1 段下げて並べ、子の行の下にも同じ形で孫・ひ孫を並べる（段下げは CSS で 3 段まで）。
 * アーカイブ済みの子（アーカイブ済みを出しているときだけ届く）は、プロジェクトのアーカイブ済みと同じく、いちばん下の閉じたまとまり「アーカイブ済み n」に分ける
 * （数と点はアーカイブしていない子だけ）。すべてアーカイブ済みなら、開閉の行を薄くして「アーカイブ済みの子チャット n」とし、中は分けずにそのまま並べる
 * （同じ見出しを 2 段にしない）。親がアーカイブ済み（parentArchived。親ごとアーカイブした子は、すべてアーカイブ済み）でも、分けずにそのまま並べる
 */
export function ChildChatRows({
  parentId,
  parentArchived,
  childrenOf,
  renderRow,
}: {
  parentId: number;
  parentArchived: boolean;
  childrenOf: ReadonlyMap<number, Chat[]>;
  renderRow: (chat: Chat) => ReactNode;
}) {
  const kids = childrenOf.get(parentId);
  const fold = useFold("sidebar", `children:${parentId}`, { defaultOpen: false });
  const { stateOf } = useChatStates();
  if (!kids?.length) return null;
  const split = parentArchived ? [kids, []] : splitArchived(kids);
  const onlyArchived = split[0].length === 0;
  const [active, archived] = onlyArchived ? [kids, []] : split;
  // 子孫のどれかが自分待ち（回答待ち・未読）なら、閉じていても点で知らせる（アーカイブ済みは数えない）
  const waiting = (list: Chat[]): boolean =>
    list.some((c) => (!c.archived_at || parentArchived) && (["needs_input", "unread", "failed"].includes(stateOf(c)) || waiting(childrenOf.get(c.id) ?? [])));
  const attention = waiting(active);
  return (
    <div className="chat-children">
      <button type="button" className={cx("chat-children-toggle", attention && "attention", onlyArchived && "archived")} aria-expanded={fold.open} onClick={fold.toggle}>
        <CornerDownRight size={12} aria-hidden />
        <span>{onlyArchived ? "アーカイブ済みの子チャット" : "子チャット"}</span>
        <span className="chat-children-count">{active.length}</span>
        {attention && <span className="chat-children-dot" aria-label="回答待ち・未読あり" />}
        <Chevron open={fold.open} />
      </button>
      <Collapse open={fold.open}>
        <ul className="chat-rows chat-child-rows">{active.map(renderRow)}</ul>
        <ArchivedFold place="sidebar" foldKey={`children:${parentId}/archived`} count={archived.length} indent className="chat-children-archived">
          <ul className="chat-rows chat-child-rows archived-rows">{archived.map(renderRow)}</ul>
        </ArchivedFold>
      </Collapse>
    </div>
  );
}
