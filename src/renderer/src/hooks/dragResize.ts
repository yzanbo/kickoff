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
  e.preventDefault();
  const handle = e.currentTarget;
  handle.setPointerCapture(e.pointerId);
  const onMove = (ev: PointerEvent) => handlers.move(ev.clientX);
  const onUp = () => {
    handle.removeEventListener("pointermove", onMove);
    handle.removeEventListener("pointerup", onUp);
    handlers.end();
  };
  handle.addEventListener("pointermove", onMove);
  handle.addEventListener("pointerup", onUp);
}
