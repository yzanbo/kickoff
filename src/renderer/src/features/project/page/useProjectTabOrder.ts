import { useMemo, useState, type DragEvent } from "react";
import { useSetting } from "@/hooks/useSetting";
import { PROJECT_TAB_ORDER } from "@/lib/storageKeys";
import { applyTabOrder, moveGroup, moveTabInGroup, type DropSide, type TabGroup } from "./tabOrder";
import { startDragGhost } from "@/ui/dragGhost";

/** ドラッグで運ぶタブの種類（ほかのドラッグと見分ける） */
const TAB_DRAG_TYPE = "application/x-kickoff-project-tab";

/** いま落とす先（同じまとまりのタブの前後 / ほかのまとまりの前後） */
type DropTarget = { kind: "tab" | "group"; key: string; side: DropSide };

/**
 * プロジェクトのタブの並べ替え（ドラッグ）。まとまりの外（ほかのまとまりの上）へ動かすと、まとまりごと動かす（ボード・チャット /
 * ファイル・検索・変更はいつも一緒）。同じまとまりの中では 1 つずつ並べ替える。並びは PROJECT_TAB_ORDER に覚える。
 * vertical なら上下の半分、横並びなら左右の半分で、前に入るか後ろに入るかを決める
 */
export function useProjectTabOrder<T extends { tab: string }, G extends TabGroup<T>>(defs: readonly G[], vertical: boolean) {
  const [saved, setSaved] = useSetting(PROJECT_TAB_ORDER);
  const groups = useMemo(() => applyTabOrder(defs, saved), [defs, saved]);
  const [dragging, setDragging] = useState<{ tab: string; group: string } | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const end = () => {
    setDragging(null);
    setDrop(null);
  };
  /** 要素の前半なら before、後半なら after */
  const sideOf = (e: DragEvent, el: Element): DropSide => {
    const r = el.getBoundingClientRect();
    return vertical ? (e.clientY < r.top + r.height / 2 ? "before" : "after") : e.clientX < r.left + r.width / 2 ? "before" : "after";
  };
  /** いまの位置で落とせる先（なければ null） */
  const targetOf = (e: DragEvent<HTMLElement>, group: G): DropTarget | null => {
    if (!dragging) return null;
    if (dragging.group !== group.key) return { kind: "group", key: group.key, side: sideOf(e, e.currentTarget) };
    const el = (e.target as Element).closest<HTMLElement>("[data-tab]");
    const tab = el?.dataset.tab;
    return el && tab && tab !== dragging.tab ? { kind: "tab", key: tab, side: sideOf(e, el) } : null;
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
          setSaved(target.kind === "tab" ? moveTabInGroup(groups, dragging.tab, target.key, target.side) : moveGroup(groups, dragging.group, target.key, target.side));
        }
        end();
      },
    }),
    /** 動かしているタブ・まとまりは薄く、落とす先には前・後ろの線（CSS の tab-drop-before / tab-drop-after） */
    // ほかのまとまりの上にいる間は、まとまりごと動かすので、動かしているまとまり全体を薄くする
    tabClass: (tab: string) =>
      drop?.kind === "tab" && drop.key === tab ? `tab-drop-${drop.side}` : dragging?.tab === tab && drop?.kind !== "group" ? "tab-dragging" : undefined,
    groupClass: (group: G) =>
      drop?.kind === "group" && drop.key === group.key
        ? `tab-drop-${drop.side}`
        : dragging?.group === group.key && (drop?.kind === "group" || group.tabs.length === 1)
          ? "tab-dragging"
          : undefined,
  };
}
