import { useEffect, useRef, useState, type DragEvent } from "react";
import { isNoopViewMove } from "@/lib/namedViews";
import { startDragGhost } from "./dragGhost";

/** ドラッグで運ぶビューの種類（ほかのドラッグと見分ける） */
const VIEW_DRAG_TYPE = "application/x-kickoff-saved-view";

/** 「ほかのビュー」の ▾ にドラッグを重ねたまま、このくらい待つとメニューを開く（Finder のフォルダと同じく、隠れた所へも落とせるように） */
const SPRING_OPEN_MS = 600;

type Side = "before" | "after";

/** 前後を決める向き（x = 横に並んだタブの左右の半分 / y = 縦に並んだメニューの項目の上下の半分） */
type Axis = "x" | "y";

/**
 * ビューのタブの並べ替え（ドラッグ。ボードの保存したビュー・サイドバーのビュー・タグ）。タブの左右の半分（縦に並んだメニューの項目は上下の半分）で前に入るか後ろに入るかを決め、
 * 落としても並びが変わらない所（自分の上・すぐ前の後ろ半分・すぐ後ろの前半分）には線を出さず落とせない。並びは onMove で覚える。
 * 入りきらないタブを入れた「ほかのビュー」のメニューの項目にも同じ tabProps を付ければ、タブの行とメニューの間でも動かせる。
 * endProps は「ほかのビュー」の ▾ に付ける（落とすといちばん後ろへ。重ねて待つと onSpring でメニューを開く）。
 * 線と薄さのクラスは `${classPrefix}-drop-before` / `-drop-after`・`${classPrefix}-dragging`、▾ は `${classPrefix}-drop-end`
 */
export function useViewTabDrag(views: readonly { id: string; name: string; state: unknown }[], onMove: (id: string, target: string, side: Side) => void, classPrefix: string) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; side: Side } | null>(null);
  const [overEnd, setOverEnd] = useState(false);
  const spring = useRef<number | undefined>(undefined);
  const stopSpring = () => {
    window.clearTimeout(spring.current);
    spring.current = undefined;
  };
  useEffect(() => stopSpring, []);
  const end = () => {
    setDragging(null);
    setDrop(null);
    setOverEnd(false);
    stopSpring();
  };
  /** いまの位置で落とせる先（なければ null） */
  const targetOf = (e: DragEvent<HTMLElement>, id: string, axis: Axis): { id: string; side: Side } | null => {
    if (!dragging) return null;
    const r = e.currentTarget.getBoundingClientRect();
    const side: Side = (axis === "y" ? e.clientY < r.top + r.height / 2 : e.clientX < r.left + r.width / 2) ? "before" : "after";
    return isNoopViewMove(views, dragging, id, side) ? null : { id, side };
  };
  /** いちばん後ろへ落とす先（もういちばん後ろなら null） */
  const lastTarget = (): { id: string; side: Side } | null => {
    const last = views.at(-1);
    if (!dragging || !last || isNoopViewMove(views, dragging, last.id, "after")) return null;
    return { id: last.id, side: "after" };
  };
  return {
    /** タブ（とメニューの項目。axis = "y"）に付ける（つかんで動かす・落とす先） */
    tabProps: (id: string, axis: Axis = "x") => ({
      draggable: true,
      onDragStart: (e: DragEvent<HTMLElement>) => {
        e.dataTransfer.setData(VIEW_DRAG_TYPE, id);
        e.dataTransfer.effectAllowed = "move";
        // 半透明の写しがカーソルに付いて動く。動かしている印の state は次の回
        startDragGhost(e, { after: () => setDragging(id) });
      },
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!e.dataTransfer.types.includes(VIEW_DRAG_TYPE)) return;
        const target = targetOf(e, id, axis);
        setDrop(target);
        if (!target) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop((d) => (d?.id === id ? null : d));
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        const target = targetOf(e, id, axis);
        if (target && dragging) {
          e.preventDefault();
          onMove(dragging, target.id, target.side);
        }
        end();
      },
      onDragEnd: end,
    }),
    /** 「ほかのビュー」の ▾ に付ける（落とすといちばん後ろへ。重ねたまま待つと onSpring（メニューを開く）を呼ぶ） */
    endProps: (onSpring: (el: HTMLElement) => void) => ({
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!e.dataTransfer.types.includes(VIEW_DRAG_TYPE) || !dragging) return;
        e.preventDefault();
        const target = lastTarget();
        e.dataTransfer.dropEffect = target ? "move" : "none";
        setOverEnd(Boolean(target));
        setDrop(null);
        if (spring.current === undefined) {
          const el = e.currentTarget;
          spring.current = window.setTimeout(() => {
            spring.current = undefined;
            onSpring(el);
          }, SPRING_OPEN_MS);
        }
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setOverEnd(false);
        stopSpring();
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        const target = lastTarget();
        if (target && dragging) {
          e.preventDefault();
          onMove(dragging, target.id, target.side);
        }
        end();
      },
    }),
    /** 落とす先のタブには前・後ろの線、動かしているタブは薄く（CSS の <classPrefix>-drop-before / -after・<classPrefix>-dragging） */
    tabClass: (id: string) => (drop?.id === id ? `${classPrefix}-drop-${drop.side}` : dragging === id ? `${classPrefix}-dragging` : undefined),
    /** ▾ にドラッグを重ねていて、いちばん後ろへ落とせるとき（CSS の <classPrefix>-drop-end） */
    endClass: overEnd ? `${classPrefix}-drop-end` : undefined,
  };
}
