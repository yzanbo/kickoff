import { useState, type DragEvent } from "react";
import { dropZoneAt, insertIndexAt, splitOfZone, type DropZone } from "./paneGeometry";
import type { SidePanelController } from "./useSidePanel";

/** 右のパネルのタブをドラッグするときの dataTransfer の型（ファイルのドロップ（チャット欄への添付）と取り違えないよう独自の型にする） */
const TAB_MIME = "application/x-kickoff-panel-tab";

/**
 * 右のパネルのタブのドラッグ（HTML5）。ほかのペインのタブの列に落とすとそのペインへ移し（同じペインなら並べ替え）、
 * ペインの中身の端に落とすとその側に分けて置き、真ん中ならそのペインへ移す。
 * ドラッグ中だけ中身の上に透明の覆い（cover）を置き、webview やターミナルの上でも落とす場所を出す
 */
export function useTabDrag(panel: SidePanelController) {
  // ドラッグ中のタブ（このパネルのタブだけを受け付ける）
  const [dragging, setDragging] = useState<string | null>(null);
  // タブの列に落とす位置（何番目の前か）と、中身の上の落とす場所
  const [insert, setInsert] = useState<{ paneId: string; index: number } | null>(null);
  const [zone, setZone] = useState<{ paneId: string; zone: DropZone } | null>(null);

  const reset = () => {
    setDragging(null);
    setInsert(null);
    setZone(null);
  };
  const accepts = (e: DragEvent) => dragging !== null && e.dataTransfer.types.includes(TAB_MIME);
  /** 要素の外へ出たときだけ（中の子へ移ったときは除く） */
  const leaving = (e: DragEvent<HTMLElement>) => !(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget));

  return {
    dragging,
    /** タブの列に落とす位置の印（index 番目のタブの前。最後なら最後のタブの後ろ） */
    insertAt: (paneId: string) => (insert?.paneId === paneId ? insert.index : null),
    /** 中身の上の落とす場所の印 */
    zoneOf: (paneId: string) => (zone?.paneId === paneId ? zone.zone : null),
    /** タブ（PanelTab の root）に付ける */
    tabProps: (key: string) => ({
      draggable: true,
      onDragStart: (e: DragEvent<HTMLElement>) => {
        e.dataTransfer.setData(TAB_MIME, key);
        e.dataTransfer.effectAllowed = "move";
        // dragstart の中で覆いを足すとドラッグが取り消されることがあるので、次の回に出す
        setTimeout(() => setDragging(key), 0);
      },
      // dragstart の次の回に出す覆いより後に片付ける
      onDragEnd: () => setTimeout(reset, 0),
    }),
    /**
     * タブの列に付ける（落とすとそのペインの、その位置へ移す）。toPaneIndex: 見た目の並びの位置をペインの並びの位置に直す
     * （タブをまとめて並べ替えて見せているとき。印の位置 insertAt は見た目の並びのまま）
     */
    barProps: (paneId: string, toPaneIndex: (index: number) => number = (i) => i) => ({
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const tabs = [...e.currentTarget.querySelectorAll<HTMLElement>(".panel-tab")].map((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, width: r.width };
        });
        const index = insertIndexAt(e.clientX, tabs);
        if (insert?.paneId !== paneId || insert.index !== index) setInsert({ paneId, index });
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        if (leaving(e) && insert?.paneId === paneId) setInsert(null);
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        if (!accepts(e) || !dragging) return;
        e.preventDefault();
        panel.moveTab(dragging, paneId, insert?.paneId === paneId ? toPaneIndex(insert.index) : undefined);
        reset();
      },
    }),
    /** ペインの中身の上の覆いに付ける（端ならその側に分けて置き、真ん中ならそのペインへ移す） */
    coverProps: (paneId: string) => ({
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const r = e.currentTarget.getBoundingClientRect();
        const next = dropZoneAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
        if (zone?.paneId !== paneId || zone.zone !== next) setZone({ paneId, zone: next });
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        if (leaving(e) && zone?.paneId === paneId) setZone(null);
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        if (!accepts(e) || !dragging) return;
        e.preventDefault();
        const split = zone?.paneId === paneId ? splitOfZone(zone.zone) : null;
        if (split) panel.splitPane(paneId, split.dir, split.side, dragging);
        else panel.moveTab(dragging, paneId);
        reset();
      },
    }),
  };
}

export type TabDrag = ReturnType<typeof useTabDrag>;
