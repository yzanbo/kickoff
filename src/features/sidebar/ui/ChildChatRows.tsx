import { MessagesSquare } from "lucide-react";
import { STATE_LOOKS, summarizeStates } from "@shared/chat/stateLooks";
import type { ReactNode } from "react";
import type { Chat } from "@shared/chat/types";
import { useChatStates, descendantStates, StatusSlot } from "@/features/chat/ui";
import { cx } from "@/foundation/ui/lib/cx";
import { useFold } from "@/foundation/ui/hooks/useFold";
import { ArchivedFold, splitArchived } from "@/foundation/ui/kit/ArchivedFold";
import { Chevron } from "@/foundation/ui/kit/Chevron";
import { Collapse } from "@/foundation/ui/kit/Collapse";

/** 開閉の行に数を出す、子孫の状態（印を出す順。既読は数えず、どれも 0 なら出さない） */
const CHILD_STATE_MARKS = ["needs_input", "failed", "unread", "running"] as const;

/**
 * サイドバーの親のチャットの下の子チャット（フォルダと同じく開閉する。初めは閉じる）。開閉の行に子の数と、子孫（孫・ひ孫も）の様子を、行の先頭と同じ状態の印と数で出す
 * （回答待ち → 失敗 → 未読 → 作業中の順。閉じていても、子チャットが動いている・答えを待っているのが分かるように）。
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
  // 子孫の状態ごとの数（アーカイブ済みは数えない。親ごとアーカイブしたときは数える）。閉じていても印で知らせる
  const { counts } = summarizeStates(descendantStates(parentId, (id) => childrenOf.get(id), stateOf, { withArchived: parentArchived || onlyArchived }));
  const marks = CHILD_STATE_MARKS.filter((state) => counts[state] > 0);
  const summary = marks.map((state) => `${STATE_LOOKS[state].label} ${counts[state]}`).join("・");
  return (
    <div className="chat-children">
      <button type="button" className={cx("chat-children-toggle", onlyArchived && "archived")} aria-expanded={fold.open} onClick={fold.toggle}>
        <MessagesSquare size={12} aria-hidden />
        <span>{onlyArchived ? "アーカイブ済みの子チャット" : "子チャット"}</span>
        <span className="chat-children-count">{active.length}</span>
        {marks.length > 0 && (
          <span className="chat-children-states" title={`子チャットの様子: ${summary}`} aria-label={`子チャットの様子: ${summary}`} role="img">
            {marks.map((state) => (
              <span key={state} className="chat-children-state">
                <StatusSlot state={state} />
                {counts[state]}
              </span>
            ))}
          </span>
        )}
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
