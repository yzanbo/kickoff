import { Inbox } from "lucide-react";
import { HANDOFF_VIA_MARKS, type ChatEventOf } from "@shared/types";
import { useTicker } from "@/hooks/useTicker";
import { formatFullDateTime, relativeTime } from "@/lib/time";

/**
 * 子チャットの作業の終わりの行の、渡したことの印（渡すたびに 1 つ。「渡しました · 入力欄へ · 5分前」。乗せると渡した日時）。
 * 何分前かは 1 分ごとに描き直す
 */
export function HandoffMarks({ handoffs }: { handoffs: readonly ChatEventOf<"handoff">[] }) {
  useTicker(60_000);
  return handoffs.map((h) => (
    <span key={h.id} className="handoff-mark" title={`${formatFullDateTime(h.created_at)} に親チャットに渡しました`}>
      <Inbox size={11} aria-hidden />
      渡しました · {HANDOFF_VIA_MARKS[h.data.via]} · {relativeTime(h.created_at)}
    </span>
  ));
}
