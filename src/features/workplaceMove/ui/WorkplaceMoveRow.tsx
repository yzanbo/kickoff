import { GitBranch } from "lucide-react";
import type { WorkplaceMoveReservation } from "@shared/chat/chatLive";
import { workplaceMoveReservationText } from "@shared/workplaceMove/aiWorkplace";
import { useActionButton } from "@/features/chat/ui";
import { Notice } from "@/foundation/ui/kit/Notice";
import { workplaceMoveApi } from "./api";

/**
 * AI が作業場所を移す予約の行（流れのいちばん下。作業中の様子の workplace_move）:
 * 作業が終わったらどこへ移るか・続きを送るかを出し、「移らない」で取り消す（取り消すと会話にお知らせが残る）
 */
export function WorkplaceMoveRow({ chatId, reservation }: { chatId: number; reservation: WorkplaceMoveReservation }) {
  const action = useActionButton();
  return (
    <Notice look="boxed" className="workplace-move-row" role="status">
      <GitBranch size={14} aria-hidden />
      <span>{workplaceMoveReservationText(reservation)}</span>
      <button
        type="button"
        className="link-button"
        title="予約を取り消して、いまの作業場所のまま続ける（続きの指示も送らない）"
        disabled={action.pending()}
        onClick={() => action.press("", () => workplaceMoveApi("DELETE /api/chats/:chatId/workplace-move", { params: { chatId } }), "作業場所を移す予約を取り消せませんでした")}
      >
        移らない
      </button>
    </Notice>
  );
}
