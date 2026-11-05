import { Shrink } from "lucide-react";
import { api } from "@/api";
import { reportFailure } from "@/ui/dialogs";

/**
 * 作業中に「会話を圧縮」を押して、圧縮を予約しているときの行（作業中の行の下。ChatLive の compact_next）。
 * いまのやり取りが終わったら、送信待ちより先にすぐ圧縮が始まることを伝え、「取り消す」で予約をやめられる。
 * 始まると予約は外れ、圧縮中の行（CompactingRow）に変わる
 */
export function CompactNextRow({ chatId }: { chatId: number }) {
  return (
    <div className="compact-next" role="status">
      <Shrink size={14} className="compact-next-icon" aria-hidden />
      <span className="compact-next-text">このやり取りが終わったら、すぐに会話を圧縮します（送信待ちの指示より先）</span>
      <button type="button" className="btn btn-sm" onClick={() => void api.cancelCompact(chatId).catch(reportFailure("圧縮の予約を取り消せませんでした"))}>
        取り消す
      </button>
    </div>
  );
}
