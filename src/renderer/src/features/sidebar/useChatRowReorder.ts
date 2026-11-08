import { useState, type DragEvent } from "react";
import type { Chat } from "@shared/types";
import { draggingChat } from "@/features/group/groups";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { useManualChatReorder, useSidebarChatOrder } from "./sidebarChatOrder";

/** 行（ChatRow）に付ける、手動の並べ替えの落とし先 */
export interface RowReorderProps {
  /** 入る位置の線（drop-before / drop-after） */
  className?: string;
  handlers: { onDragOver: (e: DragEvent) => void; onDragLeave: (e: DragEvent) => void; onDrop: (e: DragEvent) => void };
}

/**
 * サイドバーのチャットの行をドラッグで並べ替える（利用者の依頼。同じまとまり（グループ・作業場所・固定・アーカイブ済み）の中だけ）。
 * 行に重ねると、カーソルが行の上半分なら前・下半分なら後ろに線を出し、落とすとそこへ動かして手動の並びを保存する（useManualChatReorder。
 * 最近順・状態順なら手動に切り替わる）。ほかのまとまりのチャット・ほかのプロジェクトのチャット・子チャットの行は受けず、
 * 外側の落とし先（グループへ移す・プロジェクトへ移す・アーカイブ）に任せる
 */
export function useChatRowReorder(projectId: number, chats: readonly Chat[], enabled: boolean) {
  const order = useSidebarChatOrder(chats, projectId, enabled);
  const { canMove, move } = useManualChatReorder(order);
  const [target, setTarget] = useState<{ id: number; side: "before" | "after" }>();
  const clear = () => setTarget(undefined);
  useWindowEvent("dragend", clear, target !== undefined, true);

  const sideOf = (e: DragEvent): "before" | "after" => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY < r.top + r.height / 2 ? "before" : "after";
  };
  /** 行の上の dragover・drop を受けるか（同じまとまりのチャットをドラッグしているとき） */
  const accepts = (id: number) => {
    const moved = draggingChat();
    return moved !== undefined && canMove(moved, id);
  };

  return (chat: Chat): RowReorderProps | undefined => {
    if (chat.parent_chat_id !== null || !order.scope.has(chat.id)) return undefined;
    const id = chat.id;
    return {
      className: target?.id === id ? `drop-${target.side}` : undefined,
      handlers: {
        onDragOver: (e) => {
          if (!accepts(id)) return;
          // 同じまとまりの中の並べ替えは、外側の落とし先（グループ・プロジェクト）に渡さない
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "move";
          const side = sideOf(e);
          if (target?.id !== id || target.side !== side) setTarget({ id, side });
        },
        onDragLeave: (e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null) && target?.id === id) clear();
        },
        onDrop: (e) => {
          const moved = draggingChat();
          if (moved === undefined || !canMove(moved, id)) return;
          e.preventDefault();
          e.stopPropagation();
          clear();
          move(projectId, moved, id, sideOf(e));
        },
      },
    };
  };
}
