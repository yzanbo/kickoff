import { useState, type DragEvent } from "react";
import { dropZoneAt, insertSlotAt, splitOfZone, type DropZone, type InsertSlot } from "./paneGeometry";
import type { PanelController } from "@/features/panel/usePanel";
import { startDragGhost } from "@/ui/dragGhost";
import { endExternalTabDrag, EXTERNAL_TAB_MIME, useExternalTabDrag } from "./externalTabDrag";

/** 右のパネルのタブをドラッグするときの dataTransfer の型（ファイルのドロップ（チャット欄への添付）と取り違えないよう独自の型にする） */
const TAB_MIME = "application/x-kickoff-panel-tab";

/**
 * 右のパネルのタブのドラッグ（HTML5）。ほかのペインのタブの列に落とすとそのペインへ移し（同じペインなら並べ替え）、
 * ペインの中身の端に落とすとその側に分けて置き、真ん中ならそのペインへ移す。
 * ドラッグ中だけ中身の上に透明の覆い（cover）を置き、webview やターミナルの上でも落とす場所を出す。
 * パネルの外からタブにして落とすもの（externalTabDrag。ファイルタブの木の行）も同じ形で受け、落としたらタブを開いてから移す・分ける
 */
export function useTabDrag(panel: PanelController) {
  // ドラッグ中のタブ（このパネルのタブだけを受け付ける）
  const [own, setDragging] = useState<string | null>(null);
  // 外からドラッグしているタブ（この欄に落とせるものだけ）
  const external = useExternalTabDrag(panel.key);
  const dragging = own ?? external?.key ?? null;
  // タブの列に落とす位置（何番目の前か。まとまりの境目では、印を前のまとまりの最後に付けるか）と、中身の上の落とす場所
  const [insert, setInsert] = useState<({ paneId: string } & InsertSlot) | null>(null);
  const [zone, setZone] = useState<{ paneId: string; zone: DropZone } | null>(null);

  const reset = () => {
    setDragging(null);
    setInsert(null);
    setZone(null);
    endExternalTabDrag();
  };
  const accepts = (e: DragEvent) => dragging !== null && (e.dataTransfer.types.includes(TAB_MIME) || e.dataTransfer.types.includes(EXTERNAL_TAB_MIME));
  /** 落としたタブのキー（外から来たものは、ここでタブを開く） */
  const dropped = () => {
    if (!own && external) panel.openPanelTab(external);
    return dragging;
  };
  /** 要素の外へ出たときだけ（中の子へ移ったときは除く） */
  const leaving = (e: DragEvent<HTMLElement>) => !(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget));

  return {
    dragging,
    /** タブの列に落とす位置の印（index 番目のタブの前。最後なら最後のタブの後ろ。after なら前のタブの後ろ） */
    insertAt: (paneId: string): InsertSlot | null => (insert?.paneId === paneId ? { index: insert.index, after: insert.after } : null),
    /** 中身の上の落とす場所の印 */
    zoneOf: (paneId: string) => (zone?.paneId === paneId ? zone.zone : null),
    /** タブ（PanelTab の root）に付ける */
    tabProps: (key: string) => ({
      draggable: true,
      onDragStart: (e: DragEvent<HTMLElement>) => {
        e.dataTransfer.setData(TAB_MIME, key);
        e.dataTransfer.effectAllowed = "move";
        // 半透明の写しがカーソルに付いて動く。dragstart の中で覆いを足すとドラッグが取り消されることがあるので、覆いは次の回に出す
        startDragGhost(e, { after: () => setDragging(key) });
      },
      // dragstart の次の回に出す覆いより後に片付ける
      onDragEnd: () => setTimeout(reset, 0),
    }),
    /**
     * タブの列に付ける（落とすとそのペインの、その位置へ移す）。toPaneIndex: 見た目の並びの位置をペインの並びの位置に直す
     * （タブをまとめて並べ替えて見せているとき。印の位置 insertAt は見た目の並びのまま）。reorderInPlace: 同じペインの中で
     * 並びを別に決めているタブを落としたとき、その並びを変える（変えたら true で、ペインの並びは変えない。after: 前のタブの後ろに落とした）
     */
    barProps: (paneId: string, toPaneIndex: (index: number) => number = (i) => i, reorderInPlace?: (key: string, index: number, after: boolean) => boolean) => ({
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        // まとまりに分けて並べているときは、タブの入った枠（.panel-tab-group）も渡し、境目で前のまとまりの最後に入れられるようにする
        const groups: Element[] = [];
        const tabs = [...e.currentTarget.querySelectorAll<HTMLElement>(".panel-tab")].map((el) => {
          const r = el.getBoundingClientRect();
          const frame = el.closest(".panel-tab-group");
          if (frame && !groups.includes(frame)) groups.push(frame);
          return { left: r.left, width: r.width, group: frame ? groups.indexOf(frame) : -1, groupLeft: frame ? frame.getBoundingClientRect().left : r.left };
        });
        const { index, after } = insertSlotAt(e.clientX, tabs);
        if (insert?.paneId !== paneId || insert.index !== index || insert.after !== after) setInsert({ paneId, index, after });
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        if (leaving(e) && insert?.paneId === paneId) setInsert(null);
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        if (!accepts(e) || !dragging) return;
        e.preventDefault();
        const key = dropped() ?? dragging;
        // 並びを別に決めているタブ（一覧のペインのチャットのタブ = サイドバーの手動の並び）は、その並びを変える
        const slot = insert?.paneId === paneId ? insert : undefined;
        if (!slot || !reorderInPlace?.(key, slot.index, slot.after)) panel.moveTab(key, paneId, slot ? toPaneIndex(slot.index) : undefined);
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
        const key = dropped() ?? dragging;
        const split = zone?.paneId === paneId ? splitOfZone(zone.zone) : null;
        if (split) panel.splitPane(paneId, split.dir, split.side, key);
        else panel.moveTab(key, paneId);
        reset();
      },
    }),
  };
}

export type TabDrag = ReturnType<typeof useTabDrag>;
