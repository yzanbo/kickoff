import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { startHorizontalDrag } from "../../hooks/dragResize";
import { useStoredFlag, useStoredNumber } from "../../hooks/useStoredState";
import { PANEL_MAXIMIZED_KEY, PANEL_WIDTH_KEY } from "../../storageKeys";

const DEFAULT_PANEL_WIDTH = 1127;
const MIN_PANEL_WIDTH = 360;

/**
 * ボードの右側のパネルの幅（左端のつまみのドラッグで変える。覚えておく）と、横幅いっぱい（ボードを覆う）の切り替え。
 * bodyRef と style は、ボードとパネルを並べる要素（useSidePanel の body）に渡す
 */
export function usePanelWidth() {
  const [panelWidth, setPanelWidth] = useStoredNumber(PANEL_WIDTH_KEY, DEFAULT_PANEL_WIDTH);
  const [resizing, setResizing] = useState(false);
  // 横幅いっぱい（ボードを覆う）。戻すと、元の幅に戻る
  const [maximized, setMaximized] = useStoredFlag(PANEL_MAXIMIZED_KEY);
  const bodyRef = useRef<HTMLDivElement>(null);

  /** パネルの左端をドラッグして幅を変える（ボードを覆うところまで広げられる） */
  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    const body = bodyRef.current;
    if (!body) return;
    const right = body.getBoundingClientRect().right;
    const max = body.clientWidth;
    // 横幅いっぱいのときは、今の幅からドラッグを始める（ドラッグすると横幅いっぱいは解除）
    let width = maximized ? body.clientWidth : panelWidth;
    if (maximized) setMaximized(false);
    setResizing(true);
    startHorizontalDrag(e, {
      move: (clientX) => {
        width = Math.round(Math.max(MIN_PANEL_WIDTH, Math.min(max, right - clientX)));
        body.style.setProperty("--panel-w", `${width}px`);
      },
      end: () => {
        setResizing(false);
        setPanelWidth(width);
      },
    });
  };

  return {
    maximized,
    toggleMaximized: () => setMaximized(!maximized),
    resizing,
    bodyRef,
    startResize,
    /** 横幅いっぱいは、CSS 側の上限（ボードの幅）まで広げる */
    style: { "--panel-w": maximized ? "100vw" : `${panelWidth}px` } as CSSProperties,
  };
}
