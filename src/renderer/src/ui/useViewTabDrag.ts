import { useState, type DragEvent } from "react";
import { isNoopViewMove } from "@/lib/namedViews";
import { startDragGhost } from "./dragGhost";

/** ドラッグで運ぶビューの種類（ほかのドラッグと見分ける） */
const VIEW_DRAG_TYPE = "application/x-kickoff-saved-view";

type Side = "before" | "after";

/**
 * ビューのタブの並べ替え（ドラッグ。ボードの保存したビュー・サイドバーのビュー）。タブの左右の半分で前に入るか後ろに入るかを決め、落としても並びが変わらない所（自分の上・
 * すぐ前のタブの後ろ半分・すぐ後ろのタブの前半分）には線を出さず落とせない。並びは onMove で覚える。
 * 線と薄さのクラスは `${classPrefix}-drop-before` / `-drop-after`・`${classPrefix}-dragging`
 */
export function useViewTabDrag(views: readonly { id: string; name: string; state: unknown }[], onMove: (id: string, target: string, side: Side) => void, classPrefix: string) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; side: Side } | null>(null);
  const end = () => {
    setDragging(null);
    setDrop(null);
  };
  /** いまの位置で落とせる先（なければ null） */
  const targetOf = (e: DragEvent<HTMLElement>, id: string): { id: string; side: Side } | null => {
    if (!dragging) return null;
    const r = e.currentTarget.getBoundingClientRect();
    const side: Side = e.clientX < r.left + r.width / 2 ? "before" : "after";
    return isNoopViewMove(views, dragging, id, side) ? null : { id, side };
  };
  return {
    /** タブに付ける（つかんで動かす・落とす先） */
    tabProps: (id: string) => ({
      draggable: true,
      onDragStart: (e: DragEvent<HTMLElement>) => {
        e.dataTransfer.setData(VIEW_DRAG_TYPE, id);
        e.dataTransfer.effectAllowed = "move";
        // 半透明の写しがカーソルに付いて動く。動かしている印の state は次の回
        startDragGhost(e, { after: () => setDragging(id) });
      },
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!e.dataTransfer.types.includes(VIEW_DRAG_TYPE)) return;
        const target = targetOf(e, id);
        setDrop(target);
        if (!target) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop((d) => (d?.id === id ? null : d));
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        const target = targetOf(e, id);
        if (target && dragging) {
          e.preventDefault();
          onMove(dragging, target.id, target.side);
        }
        end();
      },
      onDragEnd: end,
    }),
    /** 落とす先のタブには前・後ろの線、動かしているタブは薄く（CSS の <classPrefix>-drop-before / -after・<classPrefix>-dragging） */
    tabClass: (id: string) => (drop?.id === id ? `${classPrefix}-drop-${drop.side}` : dragging === id ? `${classPrefix}-dragging` : undefined),
  };
}
