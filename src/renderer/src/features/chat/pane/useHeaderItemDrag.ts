import { useState, type DragEvent } from "react";
import { useSetting } from "@/hooks/useSetting";
import { CHAT_HEADER_ORDER } from "@/lib/storageKeys";
import { startDragGhost } from "@/ui/dragGhost";
import { isNoopHeaderMove, moveHeaderItem, orderedHeaderSections, type ChatHeaderItem } from "./chatHeaderItems";

/** ドラッグで運ぶ項目の種類（ほかのドラッグと見分ける） */
const ITEM_DRAG_TYPE = "application/x-kickoff-chat-header-item";

type Side = "before" | "after";

/**
 * 「見出しに出す項目」のメニューの並べ替え（ドラッグ）。区切り線で分けたまとまりの中だけで動かし、並びは CHAT_HEADER_ORDER に覚える
 * （見出しの行もこの順に出す）。上下の半分で前に入るか後ろに入るかを決め、落としても並びが変わらない所（すぐ前の後ろ半分・すぐ後ろの前半分・
 * ほかのまとまり）には線を出さず落とせない。押せばいままでどおり表示・非表示を切り替える
 */
export function useHeaderItemDrag() {
  const [saved, setSaved] = useSetting(CHAT_HEADER_ORDER);
  const [dragging, setDragging] = useState<ChatHeaderItem | null>(null);
  const [drop, setDrop] = useState<{ item: ChatHeaderItem; side: Side } | null>(null);
  const end = () => {
    setDragging(null);
    setDrop(null);
  };
  /** いまの位置で落とせる先（なければ null） */
  const targetOf = (e: DragEvent<HTMLElement>, item: ChatHeaderItem): { item: ChatHeaderItem; side: Side } | null => {
    if (!dragging || dragging === item) return null;
    const r = e.currentTarget.getBoundingClientRect();
    const side: Side = e.clientY < r.top + r.height / 2 ? "before" : "after";
    return isNoopHeaderMove(saved, dragging, item, side) ? null : { item, side };
  };
  return {
    /** まとまり（覚えた並び） */
    sections: orderedHeaderSections(saved),
    /** 並べ替えているか（「既定に戻す」を押せるかに使う） */
    order: saved,
    /** 並びを初めに戻す */
    resetOrder: () => setSaved([]),
    /** 項目のボタンに付ける（つかんで動かす・落とす先） */
    itemProps: (item: ChatHeaderItem) => ({
      draggable: true,
      "data-header-item": item,
      className: drop?.item === item ? `menu-drop-${drop.side}` : dragging === item ? "menu-dragging" : undefined,
      onDragStart: (e: DragEvent<HTMLButtonElement>) => {
        e.dataTransfer.setData(ITEM_DRAG_TYPE, item);
        e.dataTransfer.effectAllowed = "move";
        // 半透明の写しがカーソルに付いて動く（メニューの中に置く）。動かしている印の state は次の回
        startDragGhost(e, { after: () => setDragging(item) });
      },
      onDragOver: (e: DragEvent<HTMLButtonElement>) => {
        if (!e.dataTransfer.types.includes(ITEM_DRAG_TYPE)) return;
        const target = targetOf(e, item);
        setDrop(target);
        if (!target) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      },
      onDragLeave: (e: DragEvent<HTMLButtonElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop((d) => (d?.item === item ? null : d));
      },
      onDrop: (e: DragEvent<HTMLButtonElement>) => {
        const target = targetOf(e, item);
        if (target && dragging) {
          e.preventDefault();
          setSaved(moveHeaderItem(saved, dragging, target.item, target.side));
        }
        end();
      },
      onDragEnd: end,
    }),
  };
}
