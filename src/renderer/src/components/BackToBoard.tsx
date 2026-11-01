import { ChevronLeft, SquareKanban } from "lucide-react";
import { href } from "../router";

/** チャット画面からプロジェクトのカンバンへ戻るボタン */
export function BackToBoard({ projectId }: { projectId: number }) {
  return (
    <a className="back-button" href={href({ name: "project", id: projectId, tab: "board" })} title="プロジェクトのカンバンに戻る">
      <ChevronLeft size={14} />
      <SquareKanban size={14} />
      カンバン
    </a>
  );
}
