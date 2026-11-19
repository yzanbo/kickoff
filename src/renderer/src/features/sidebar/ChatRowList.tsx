import type { ReactNode } from "react";
import type { Chat } from "@shared/types";
import { cx } from "@/lib/cx";
import { useProgressiveRows } from "@/hooks/useProgressiveRows";
import { ProgressiveSpacer } from "@/ui/ProgressiveRows";

/**
 * サイドバーのチャットの行の一覧（`ul.chat-rows`）。プロジェクトの一覧を開いた直後は、配られた上限（hooks/useProgressiveRows.ts）の数だけ
 * 頭から描き、残りの場所は空の箱で取る（最初の描画のあとにすべて描く）
 */
export function ChatRowList({ chats, renderRow, className }: { chats: readonly Chat[]; renderRow: (chat: Chat) => ReactNode; className?: string }) {
  const { shown, omitted } = useProgressiveRows(chats);
  return (
    <ul className={cx("chat-rows", className)}>
      {shown.map(renderRow)}
      <ProgressiveSpacer omitted={omitted} as="li" />
    </ul>
  );
}
