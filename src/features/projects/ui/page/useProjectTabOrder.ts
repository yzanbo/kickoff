import { useMemo, useState, type DragEvent } from "react";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { storage } from "@/features/projects/ui/storage";
import { applyTabOrder, flatTabOrder, isNoopDrop, mergeSubsetOrder, orderAfterDrop, type DropSide, type TabDragging, type TabDropTarget, type TabGroup } from "./tabOrder";
import { startDragGhost } from "@/foundation/ui/kit/dragGhost";
import { dragAttrs } from "@/foundation/ui/kit/drag/dragAttrs";

/** ドラッグで運ぶタブの種類（ほかのドラッグと見分ける） */
const TAB_DRAG_TYPE = "application/x-kickoff-project-tab";


/**
 * プロジェクトのタブの並べ替え（ドラッグ）。まとまりの外（ほかのまとまりの上）へ動かすと、まとまりごと動かす（ボード・チャット /
 * ファイル・検索・変更はいつも一緒）。同じまとまりの中では 1 つずつ並べ替える。まとまりの端のつまみ（groupHandleProps）をつかむと、
 * はじめからまとまりごと動かす（写しもまとまり全体）。並びは storage.settings.tabOrder に覚える。
 * vertical なら上下の半分、横並びなら左右の半分で、前に入るか後ろに入るかを決める。落としても並びが変わらない所（すぐ前のタブの後ろ半分・
 * すぐ後ろのタブの前半分・動かしているものの上）は落とす先にしない（線を出さない）。
 * all: defs がプロジェクトのタブの一部のとき（右サイドバーの右端の列。ボード・チャットがない）の全体のまとまり。落としたら全体の並びに戻して覚える（mergeSubsetOrder）
 */
export function useProjectTabOrder<T extends { tab: string }, G extends TabGroup<T>>(defs: readonly G[], vertical: boolean, all?: readonly TabGroup<{ tab: string }>[]) {
  // 線の向き（横に並ぶタブは縦の線）
  const axis = vertical ? "y" : "x";
  const [saved, setSaved] = useSetting(storage.settings.tabOrder);
  const groups = useMemo(() => applyTabOrder(defs, saved), [defs, saved]);
  const save = (next: string[]) => setSaved(all ? mergeSubsetOrder(flatTabOrder(applyTabOrder(all, saved)), next) : next);
  // 動かしているもの（tab が null なら、つまみでつかんだまとまり全体）
  const [dragging, setDragging] = useState<TabDragging | null>(null);
  const [drop, setDrop] = useState<TabDropTarget | null>(null);
  const end = () => {
    setDragging(null);
    setDrop(null);
  };
  /** 要素の前半なら before、後半なら after */
  const sideOf = (e: DragEvent, el: Element): DropSide => {
    const r = el.getBoundingClientRect();
    return vertical ? (e.clientY < r.top + r.height / 2 ? "before" : "after") : e.clientX < r.left + r.width / 2 ? "before" : "after";
  };
  /** 動かす先の候補（並びが変わるかは見ない） */
  const candidateOf = (e: DragEvent<HTMLElement>, group: G): TabDropTarget | null => {
    if (!dragging) return null;
    if (dragging.group !== group.key) return { kind: "group", key: group.key, side: sideOf(e, e.currentTarget) };
    if (dragging.tab === null) return null;
    const el = (e.target as Element).closest<HTMLElement>("[data-tab]");
    const tab = el?.dataset.tab;
    return el && tab && tab !== dragging.tab ? { kind: "tab", key: tab, side: sideOf(e, el) } : null;
  };
  /** いまの位置で落とせる先（なければ null。落としても並びが変わらないなら null） */
  const targetOf = (e: DragEvent<HTMLElement>, group: G): TabDropTarget | null => {
    const target = candidateOf(e, group);
    return target && dragging && !isNoopDrop(groups, dragging, target) ? target : null;
  };

  return {
    groups,
    /** 並べ替えたか（右クリックの「タブの並びを元に戻す」を出す） */
    customized: saved.length > 0,
    reset: () => setSaved([]),
    /** タブに付ける（つかんで動かす） */
    tabProps: (group: G, tab: string) => ({
      draggable: true,
      "data-tab": tab,
      onDragStart: (e: DragEvent) => {
        e.dataTransfer.setData(TAB_DRAG_TYPE, tab);
        e.dataTransfer.effectAllowed = "move";
        // 半透明の写しがカーソルに付いて動く。動かしている印の state は次の回
        startDragGhost(e, { after: () => setDragging({ tab, group: group.key }) });
      },
      onDragEnd: end,
    }),
    /** まとまりのつまみに付ける（つかむと、まとまりごと動かす。写しはまとまり全体） */
    groupHandleProps: (group: G) => ({
      draggable: true,
      onDragStart: (e: DragEvent<HTMLElement>) => {
        e.dataTransfer.setData(TAB_DRAG_TYPE, group.key);
        e.dataTransfer.effectAllowed = "move";
        startDragGhost(e, { source: e.currentTarget.parentElement, after: () => setDragging({ tab: null, group: group.key }) });
      },
      onDragEnd: end,
    }),
    /** まとまりの要素に付ける（落とす先） */
    groupProps: (group: G) => ({
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return;
        const target = targetOf(e, group);
        setDrop(target);
        if (!target) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop(null);
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        const target = targetOf(e, group);
        if (target && dragging) {
          e.preventDefault();
          save(orderAfterDrop(groups, dragging, target));
        }
        end();
      },
    }),
    /**
     * 動かしているタブ・まとまりは薄く（data-drag-source）、落とす先には前・後ろの線（data-drop。線はどちらも ::after に引く。縦のタブの
     * 選んでいる印が ::before のため）。ほかのまとまりの上にいる間は、まとまりごと動かすので、動かしているまとまり全体を薄くする
     */
    tabAttrs: (tab: string) => {
      const side = drop?.kind === "tab" && drop.key === tab && drop.side;
      return dragAttrs(side, { source: !side && dragging?.tab === tab && drop?.kind !== "group", axis, line: "after" });
    },
    groupAttrs: (group: G) => {
      const side = drop?.kind === "group" && drop.key === group.key && drop.side;
      const source = !side && dragging?.group === group.key && (drop?.kind === "group" || dragging.tab === null || group.tabs.length === 1);
      return dragAttrs(side, { source, axis, line: "after" });
    },
  };
}
