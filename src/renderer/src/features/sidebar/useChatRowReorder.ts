import { useState, type DragEvent } from "react";
import type { Chat } from "@shared/types";
import { errorMessage } from "@shared/errors";
import { draggingChat } from "@/features/group/groups";
import { detachChild } from "@/features/chat/children/detachChild";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { knownChat } from "@/stores/chats";
import { alertDialog } from "@/ui/dialogs";
import { useChatLayout } from "./chatGroupings";
import { childRowDrop } from "./childRowDrop";
import { useManualChatReorder, useSidebarChatOrder } from "./sidebarChatOrder";

/** 行（ChatRow）に付ける、手動の並べ替えの落とし先 */
export interface RowReorderProps {
  /** 入る位置の線（drop-before / drop-after）・子にする行の枠（drop-into） */
  className?: string;
  handlers: { onDragOver: (e: DragEvent) => void; onDragLeave: (e: DragEvent) => void; onDrop: (e: DragEvent) => void };
}

type Side = "before" | "after" | "into";

/** 外すのに失敗したとき（作業中になった・消えたなど） */
const reportDetach = (e: unknown) => void alertDialog("親から外せませんでした", errorMessage(e));

/**
 * サイドバーのチャットの行をドラッグで並べ替える（利用者の依頼。同じまとまり（グループ・作業場所・固定・アーカイブ済み）の中だけ）。
 * 行に重ねると、カーソルが行の上半分なら前・下半分なら後ろに線を出し、落とすとそこへ動かして手動の並びを保存する（useManualChatReorder。
 * 最近順・状態順なら手動に切り替わる）。ほかのまとまりのチャット・ほかのプロジェクトのチャットは受けず、
 * 外側の落とし先（グループへ移す・プロジェクトへ移す・アーカイブ）に任せる。
 * 子チャットの行のドラッグは、親から外す落とし先にする（childRowDrop。確かめてから detachChild）: 自分の先祖の行（いまの親より上）に
 * 重ねると枠を出してその子に上げ、まとめないときの一覧の行の間では親のないチャットにしてその位置へ置く。同じ家系のほかの行には落とせない
 */
export function useChatRowReorder(projectId: number, chats: readonly Chat[], enabled: boolean) {
  const order = useSidebarChatOrder(chats, projectId, enabled);
  const { canMove, move, insert } = useManualChatReorder(order);
  const { grouping } = useChatLayout();
  const [target, setTarget] = useState<{ id: number; side: Side }>();
  const clear = () => setTarget(undefined);
  useWindowEvent("dragend", clear, target !== undefined, true);

  const sideOf = (e: DragEvent): "before" | "after" => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY < r.top + r.height / 2 ? "before" : "after";
  };
  /** ドラッグしている子チャットを、この行に重ねたときの扱い（子チャットのドラッグでなければ null） */
  const childDrop = (chat: Chat) => {
    const id = draggingChat();
    const dragged = id === undefined ? undefined : knownChat(id);
    return dragged ? { dragged, kind: childRowDrop(dragged, chat, knownChat, grouping === "none") } : null;
  };
  /** 行の上の dragover・drop を受けるか（同じまとまりのチャットをドラッグしているとき） */
  const accepts = (id: number) => {
    const moved = draggingChat();
    return moved !== undefined && canMove(moved, id);
  };

  /** 子チャットのドラッグ（親から外す）の落とし先。受けなければ undefined */
  const childHandlers = (chat: Chat): RowReorderProps["handlers"] => ({
    onDragOver: (e) => {
      const drop = childDrop(chat);
      if (!drop?.kind) return;
      // 子チャットの行は親の行の中にあるので、外側の行・グループの落とし先へ渡さない
      e.stopPropagation();
      if (drop.kind === "block") {
        if (target?.id === chat.id) clear();
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const side: Side = drop.kind === "into" ? "into" : sideOf(e);
      if (target?.id !== chat.id || target.side !== side) setTarget({ id: chat.id, side });
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null) && target?.id === chat.id) clear();
    },
    onDrop: (e) => {
      const drop = childDrop(chat);
      if (!drop?.kind) return;
      e.stopPropagation();
      e.preventDefault();
      clear();
      if (drop.kind === "into") return void detachChild(drop.dragged, { parentId: chat.id }).catch(reportDetach);
      if (drop.kind === "between") {
        const side = sideOf(e);
        void detachChild(drop.dragged, { parentId: null, groupId: null })
          .then((detached) => detached && insert(projectId, detached.id, chat.id, side))
          .catch(reportDetach);
      }
    },
  });

  return (chat: Chat): RowReorderProps | undefined => {
    const id = chat.id;
    const child = childHandlers(chat);
    const className = target?.id === id ? `drop-${target.side}` : undefined;
    // 子チャットの行は並べ替えない（親から外す落とし先だけ）
    if (chat.parent_chat_id !== null || !order.scope.has(id)) return { className, handlers: child };
    return {
      className,
      handlers: {
        onDragOver: (e) => {
          if (childDrop(chat)?.kind) return child.onDragOver(e);
          if (!accepts(id)) return;
          // 同じまとまりの中の並べ替えは、外側の落とし先（グループ・プロジェクト）に渡さない
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "move";
          const side = sideOf(e);
          if (target?.id !== id || target.side !== side) setTarget({ id, side });
        },
        onDragLeave: child.onDragLeave,
        onDrop: (e) => {
          if (childDrop(chat)?.kind) return child.onDrop(e);
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
