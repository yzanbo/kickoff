import { useEffect, useEffectEvent, useState } from "react";
import type { DevtoolsBounds } from "@shared/foundation/ipc";
import { useLatest } from "@/foundation/ui/hooks/useLatest";
import { boxesOverlap, intersectBoxes, sameBox } from "./devtoolsBox";
import { nativeDevtools } from "./native";

type Point = { x: number; y: number };

/** 隠している間に代わりに見せる、開発者ツールの見た目（撮ったときの幅で描く） */
export interface DevtoolsSnapshot {
  src: string;
  width: number;
}

// 画面の HTML より上に重なって描かれるもの（メニュー・ポップオーバー・説明の吹き出し・ダイアログ・お知らせ・ドラッグの絵）。
// 右・下に並べた開発者ツールはウィンドウに重ねた表示（WebContentsView）で、HTML より上に描かれるので、これらが重なる間は隠す
const OVERLAYS = ":popover-open, dialog[open], .toast-stack, .drag-ghost, .drop-blocked-hint";

/** 要素の描かれている範囲（display: contents などで自分に大きさがなければ、子の範囲） */
function boxesOf(el: Element): DevtoolsBounds[] {
  const rect = el.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) return [rect];
  return [...el.children].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
}

/** 開発者ツールの範囲の上に、HTML の重なり（メニューなど）が描かれているか */
function coveredByOverlay(slot: HTMLElement, box: DevtoolsBounds): boolean {
  const candidates = [...document.querySelectorAll(OVERLAYS), ...[...document.body.children].filter((el) => el.id !== "root" && !(el instanceof HTMLScriptElement))];
  return candidates.some((el) => !el.contains(slot) && boxesOf(el).some((r) => boxesOverlap(r, box)));
}

/** 開発者ツールを置く範囲（見えていない・大きさがなければ null）。はみ出した分は、ブラウザの本体の欄と窓の中に切る */
function slotBox(slot: HTMLElement): DevtoolsBounds | null {
  if (!slot.isConnected || !slot.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return null;
  const rect = slot.getBoundingClientRect();
  const frame = slot.closest(".browser-body")?.getBoundingClientRect() ?? rect;
  const inFrame = intersectBoxes(rect, frame);
  const box = inFrame && intersectBoxes(inFrame, { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight });
  return box && box.width >= 1 && box.height >= 1 ? box : null;
}

interface Options {
  /** 開発者ツールを出す埋め込みブラウザの WebContents の ID（まだ準備ができていなければ undefined） */
  targetId: () => number | undefined;
  /** 右・下に出しているか */
  active: boolean;
  /** 開き直すたびに変わる値（変わったら新しく開く） */
  openKey: number;
  /** ブラウザのタブが表に出ているか */
  visible: boolean;
  /** 境目をドラッグしているか（重ねた表示がポインターを横取りしないよう、その間は隠す） */
  resizing: boolean;
  /** 開くときに検証する位置（右クリックの「検証」）を受け取る */
  takeInspect: () => Point | undefined;
  /** 開けなかった */
  onFail: () => void;
}

/**
 * 右・下に並べた開発者ツールを、画面の中の枠（slotRef を付けた要素）にぴったり重ねる。
 * 枠の位置と大きさは毎フレーム測り（欄の幅を変える・移すと、大きさが変わらずに位置だけ動くことがあるため）、変わったときだけメインに知らせる。
 * タブが裏にある・枠が見えないときは隠し、メニューなどが上に重なる・境目をドラッグしている間は、撮った見た目（snapshot）を枠に出してから隠す
 */
export function useDockedDevtools({ targetId, active, openKey, visible, resizing, takeInspect, onFail }: Options) {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const [snapshot, setSnapshot] = useState<DevtoolsSnapshot | null>(null);
  const [opened, setOpened] = useState(false);
  const visibleNow = useLatest(visible);
  const resizingNow = useLatest(resizing);
  const readTarget = useEffectEvent(targetId);
  const readInspect = useEffectEvent(takeInspect);
  const fail = useEffectEvent(onFail);

  useEffect(() => {
    const api = nativeDevtools();
    if (!active || !slot || !api) return;
    let stopped = false;
    let frame = 0;
    let phase: "waiting" | "opening" | "open" = "waiting";
    // 最後にメインに知らせた置き場所（null は隠している）と、知らせの順番（撮っている間に変わったら、古い結果を捨てる）
    let placed: DevtoolsBounds | null = null;
    let seq = 0;
    const tick = () => {
      if (stopped) return;
      frame = requestAnimationFrame(tick);
      const id = readTarget();
      if (id === undefined) return;
      const box = slotBox(slot);
      if (phase === "waiting") {
        // 枠の大きさが決まってから開く
        if (!box || !visibleNow.current) return;
        phase = "opening";
        placed = box;
        api.openIn(id, box, readInspect()).then(
          () => {
            if (stopped) return;
            phase = "open";
            setOpened(true);
          },
          () => {
            if (!stopped) fail();
          },
        );
        return;
      }
      if (phase !== "open") return;
      const cover = box !== null && (resizingNow.current || coveredByOverlay(slot, box));
      const want = visibleNow.current && box && !cover ? box : null;
      if (sameBox(want, placed)) return;
      seq += 1;
      const turn = seq;
      placed = want;
      if (want) {
        void api.place(id, want);
        setSnapshot(null);
      } else if (cover && box) {
        // 撮った見た目を枠に出してから隠す（隠したまま空の枠にしない）
        void api.snapshot(id).then((src) => {
          if (stopped || turn !== seq) return;
          setSnapshot(src ? { src, width: box.width } : null);
          void api.place(id, null);
        });
      } else {
        setSnapshot(null);
        void api.place(id, null);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      setOpened(false);
      setSnapshot(null);
      // 枠がなくなった（タブを裏の部品にしまったなど）ときに、重ねた表示だけが残らないよう隠す（閉じるのは呼ぶ側）
      const id = readTarget();
      if (id !== undefined && phase !== "waiting") void api.place(id, null);
    };
  }, [active, slot, openKey, visibleNow, resizingNow]);

  return {
    /** 開発者ツールを重ねる枠に付ける */
    slotRef: setSlot,
    /** 隠している間に枠に出す見た目 */
    snapshot,
    /** 開き終えたか（それまでの「検証」は、開くときに渡す） */
    opened,
  };
}
