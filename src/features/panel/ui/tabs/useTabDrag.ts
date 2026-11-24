import { useState, type DragEvent, type PointerEvent } from "react";
import { dropZoneAt, insertSlotAt, splitOfZone, type DropZone, type InsertSlot } from "@/features/panel/ui/layout/paneGeometry";
import type { PanelController } from "@/features/panel/ui/usePanel";
import { startDragGhost } from "@/foundation/ui/kit/dragGhost";
import { panelStateOf } from "@/features/panel/ui/state/panelStore";
import { canPopOut, popOutTab } from "@/features/panel/ui/tabs/popOutTab";
import { kindOf } from "@/features/panel/ui/state/panelStore";
import { openTab } from "@/features/panel/ui/state/actions";
import { endExternalTabDrag, EXTERNAL_TAB_MIME, useExternalTabDrag } from "@/features/panel/ui/layout/externalTabDrag";
import { endedOutsideWindow } from "@/features/panel/ui/layout/tabDragOut";
import { discardTabThumbnail, prepareTabThumbnail, tabThumbnailOf } from "@/features/panel/ui/layout/tabThumbnail";
import { movingMimeFor, parseMovingTab, takeMovingTab, useMovedOutTabs, writeMovingTab } from "./tabTransfer";

/** 右のパネルのタブをドラッグするときの dataTransfer の型（ファイルのドロップ（チャット欄への添付）と取り違えないよう独自の型にする） */
const TAB_MIME = "application/x-kickoff-panel-tab";

/** ドラッグを始めたとき、タブの中でつかんだ位置（左上から。ウィンドウの外で離したら、新しいウィンドウのタブがぴったり重なるように置く） */
let grab = { x: 0, y: 0 };

/** 見た目の並びの位置がそのままペインの並びの位置（まとめて並べ替えていないとき） */
const samePaneIndex = (index: number) => index;

/**
 * 右のパネルのタブのドラッグ（HTML5）。ほかのペインのタブの列に落とすとそのペインへ移し（同じペインなら並べ替え）、
 * ペインの中身の端に落とすとその側に分けて置き、真ん中ならそのペインへ移す。
 * ドラッグ中だけ中身の上に透明の覆い（cover）を置き、webview やターミナルの上でも落とす場所を出す。
 * パネルの外からタブにして落とすもの（externalTabDrag。ファイルタブの木の行）も同じ形で受け、落としたらタブを開いてから移す・分ける。
 * ウィンドウの外で離したら、そのタブを別ウィンドウで開き、離した所に置く（別ウィンドウで開けるタブだけ。tabDragOut.ts）。
 * 別ウィンドウで開けるタブは、ドラッグの絵をタブの中身の小さなサムネイルにする（ウィンドウの外でも見える OS のドラッグの絵。tabThumbnail.ts）。
 * ブラウザ・チャットのタブは、ほかのウィンドウの同じ種類を出す欄のタブの列に落としても移る（右サイドバー ⇔ ブラウザの別ウィンドウ・チャットのパネル ⇔ チャットの別ウィンドウ。tabTransfer.ts）
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
  // ほかのウィンドウへドラッグで移したタブを閉じる
  useMovedOutTabs(panel.key);
  const accepts = (e: DragEvent) => dragging !== null && (e.dataTransfer.types.includes(TAB_MIME) || e.dataTransfer.types.includes(EXTERNAL_TAB_MIME));
  /** ほかのウィンドウ（同じウィンドウのほかの欄も）からドラッグしてきたタブの型（その種類を出す欄のタブの列だけで受ける。受けなければ null） */
  const movingMime = (e: DragEvent) => (dragging === null ? movingMimeFor(e.dataTransfer.types, (kind) => panel.kinds.has(kind)) : null);
  /** 落としたタブのキー（外から来たものは、ここでタブを開く） */
  const dropped = () => {
    if (!own && external) openTab(panel.key, external);
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
      // 別ウィンドウで開けるタブは、押した時点でドラッグのサムネイルを用意する（OS のドラッグの絵は dragstart で決まるので、中身はその前に撮る）
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (e.button !== 0) return;
        const tab = panelStateOf(panel.key).tabs.find((t) => t.key === key);
        if (tab && canPopOut(tab, panel.key)) prepareTabThumbnail(key, kindOf(tab).label(tab));
      },
      onPointerUp: () => discardTabThumbnail(),
      onDragStart: (e: DragEvent<HTMLElement>) => {
        e.dataTransfer.setData(TAB_MIME, key);
        e.dataTransfer.effectAllowed = "move";
        const rect = e.currentTarget.getBoundingClientRect();
        grab = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const tab = panelStateOf(panel.key).tabs.find((t) => t.key === key);
        if (tab) writeMovingTab(e.dataTransfer, panel.key, tab);
        const thumbnail = tabThumbnailOf(key);
        if (thumbnail) {
          // タブの中身の小さなサムネイルがカーソルに付いて動く（ウィンドウの外でも）。覆いは次の回に出す
          e.dataTransfer.setDragImage(thumbnail, 24, 14);
          setTimeout(() => setDragging(key), 0);
          return;
        }
        // 半透明の写しがカーソルに付いて動く。dragstart の中で覆いを足すとドラッグが取り消されることがあるので、覆いは次の回に出す
        startDragGhost(e, { after: () => setDragging(key) });
      },
      onDragEnd: (e: DragEvent<HTMLElement>) => {
        // dragstart の次の回に出す覆いより後に片付ける
        setTimeout(reset, 0);
        discardTabThumbnail();
        // ウィンドウの外で離した: 別ウィンドウで開く（開けないタブは何もしない）。新しいウィンドウの最初のタブが、離したときのタブの位置にぴったり重なるように置く
        const end = { clientX: e.clientX, clientY: e.clientY, dropEffect: e.dataTransfer.dropEffect };
        if (endedOutsideWindow(end, { width: window.innerWidth, height: window.innerHeight }))
          popOutTab(panel, key, { x: e.screenX - grab.x, y: e.screenY - grab.y });
      },
    }),
    /**
     * タブの列に付ける（落とすとそのペインの、その位置へ移す）。toPaneIndex: 見た目の並びの位置をペインの並びの位置に直す
     * （タブをまとめて並べ替えて見せているとき。印の位置 insertAt は見た目の並びのまま）。reorderInPlace: 同じペインの中で
     * 並びを別に決めているタブを落としたとき、その並びを変える（変えたら true で、ペインの並びは変えない。after: 前のタブの後ろに落とした）
     */
    barProps: (paneId: string, toPaneIndex: (index: number) => number = samePaneIndex, reorderInPlace?: (key: string, index: number, after: boolean) => boolean) => ({
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!accepts(e) && !movingMime(e)) return;
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
        // ほかのウィンドウ・ほかの欄から来たタブ: ここに開き直して、落とした位置へ置く
        const mime = movingMime(e);
        if (mime) {
          const moving = parseMovingTab(e.dataTransfer.getData(mime));
          e.preventDefault();
          const slot = insert?.paneId === paneId ? insert : undefined;
          if (moving) panel.moveTab(takeMovingTab(panel.key, moving), paneId, slot ? toPaneIndex(slot.index) : undefined);
          reset();
          return;
        }
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
