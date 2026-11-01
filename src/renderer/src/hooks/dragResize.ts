import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * つまみ（区切り線）を左右にドラッグして幅を変える。
 * つまみがポインターを捕まえるので、指がつまみの外に出ても追従する
 */
export function startHorizontalDrag(
  e: ReactPointerEvent<HTMLElement>,
  handlers: {
    /** ドラッグ中（ポインターの x 座標） */
    move: (clientX: number) => void;
    /** 指を離したとき */
    end: () => void;
  },
) {
  startDrag(e, (ev) => handlers.move(ev.clientX), handlers.end);
}

/** つまみを上下にドラッグして高さを変える（move にはポインターの y 座標が届く） */
export function startVerticalDrag(e: ReactPointerEvent<HTMLElement>, handlers: { move: (clientY: number) => void; end: () => void }) {
  startDrag(e, (ev) => handlers.move(ev.clientY), handlers.end);
}

function startDrag(e: ReactPointerEvent<HTMLElement>, move: (ev: PointerEvent) => void, end: () => void) {
  e.preventDefault();
  const handle = e.currentTarget;
  handle.setPointerCapture(e.pointerId);
  const onMove = (ev: PointerEvent) => move(ev);
  const onUp = () => {
    handle.removeEventListener("pointermove", onMove);
    handle.removeEventListener("pointerup", onUp);
    end();
  };
  handle.addEventListener("pointermove", onMove);
  handle.addEventListener("pointerup", onUp);
}
