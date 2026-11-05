import { CornerDownRight } from "lucide-react";
import type { ReactNode } from "react";
import type { Chat } from "@shared/types";
import { useChatStates } from "@/app/chatStatesContext";
import { cx } from "@/lib/cx";
import { useFold } from "@/hooks/useFold";
import { Chevron } from "@/ui/Chevron";
import { Collapse } from "@/ui/Collapse";

/**
 * サイドバーの親のチャットの下の子チャット（フォルダと同じく開閉する。初めは閉じる）。開閉の行に子の数と、子のどれかが回答待ち・未読なら点を出す。
 * 開くと子の行を 1 段下げて並べ、子の行の下にも同じ形で孫・ひ孫を並べる（段下げは CSS で 3 段まで）
 */
export function ChildChatRows({ parentId, childrenOf, renderRow }: { parentId: number; childrenOf: ReadonlyMap<number, Chat[]>; renderRow: (chat: Chat) => ReactNode }) {
  const kids = childrenOf.get(parentId);
  const fold = useFold("sidebar", `children:${parentId}`, { defaultOpen: false });
  const { stateOf } = useChatStates();
  if (!kids?.length) return null;
  // 子孫のどれかが自分待ち（回答待ち・未読）なら、閉じていても点で知らせる
  const waiting = (list: Chat[]): boolean => list.some((c) => ["needs_input", "unread", "failed"].includes(stateOf(c)) || waiting(childrenOf.get(c.id) ?? []));
  const attention = waiting(kids);
  return (
    <div className="chat-children">
      <button type="button" className={cx("chat-children-toggle", attention && "attention")} aria-expanded={fold.open} onClick={fold.toggle}>
        <CornerDownRight size={12} aria-hidden />
        <span>子チャット</span>
        <span className="chat-children-count">{kids.length}</span>
        {attention && <span className="chat-children-dot" aria-label="回答待ち・未読あり" />}
        <Chevron open={fold.open} />
      </button>
      <Collapse open={fold.open}>
        <ul className="chat-rows chat-child-rows">{kids.map(renderRow)}</ul>
      </Collapse>
    </div>
  );
}
