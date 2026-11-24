import { Eraser, FolderInput } from "lucide-react";
import type { ChatEventOf } from "@shared/chat/chatEvent";
import { workplaceMoveLine } from "@shared/workplaceMove/workplaceMoves";

/** 送信待ちの「コンテキストを消去」で、ここから新しい会話にした境目（上の会話は AI に引き継いでいない） */
export function ContextClearedDivider({ event }: { event: ChatEventOf<"context_cleared"> }) {
  return (
    <div className="context-cleared-divider divider-label" id={`ev-${event.id}`} role="separator" aria-label="コンテキストを消去しました">
      <Eraser size={12} aria-hidden />
      <span>コンテキストを消去しました（ここから新しい会話）</span>
    </div>
  );
}

/** 作業場所を移した区切り。これより上の発言は巻き戻せず、分岐の起点にもできない */
export function WorkplaceMovedDivider({ event }: { event: ChatEventOf<"workplace_moved"> }) {
  return (
    <div className="workplace-moved-divider divider-label" id={`ev-${event.id}`} role="separator" aria-label="作業場所を移しました">
      <FolderInput size={12} aria-hidden />
      <span>{workplaceMoveLine(event.data)}</span>
    </div>
  );
}
