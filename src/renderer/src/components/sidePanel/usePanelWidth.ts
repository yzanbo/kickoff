import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { startHorizontalDrag } from "../../hooks/dragResize";
import { useStoredFlag, useStoredNumber } from "../../hooks/useStoredState";
import { PANEL_MAXIMIZED_KEY, PANEL_WIDTH_KEY } from "../../storageKeys";

const DEFAULT_PANEL_WIDTH = 1127;
const MIN_PANEL_WIDTH = 360;
/** ボードとパネルの間隔（side-panel.css の .board-body.with-panel の gap） */
const PANEL_GAP = 12;
/**
 * パネルの横に残るボードがこれより狭くなるなら、パネルでボードを覆う（列が 1 本も入らない細い帯を残さない）。
 * 狭いボードは列を 1 本ずつめくる表示になる（board-columns.css の @container）ので、1 本が収まる幅にする
 */
const MIN_BOARD_WIDTH = 200;

/** パネルの幅 width のとき、横に残るボードが狭すぎるか（そのときはボードを覆う） */
function leavesNarrowBoard(bodyWidth: number, width: number): boolean {
  if (bodyWidth <= 0) return false;
  const board = bodyWidth - PANEL_GAP - Math.min(width, bodyWidth - PANEL_GAP);
  return board < MIN_BOARD_WIDTH;
}

/**
 * ボードの右側のパネルの幅（左端のつまみのドラッグで変える。覚えておく）と、横幅いっぱい（ボードを覆う）の切り替え。
 * 横に残るボードが狭すぎるとき（チャット欄を広げた・ウィンドウを狭めた）は、覚えた幅のままボードを覆い、広がったら戻す。
 * bodyRef と style は、ボードとパネルを並べる要素（useSidePanel の body）に渡す
 */
export function usePanelWidth() {
  const [panelWidth, setPanelWidth] = useStoredNumber(PANEL_WIDTH_KEY, DEFAULT_PANEL_WIDTH);
  const [resizing, setResizing] = useState(false);
  // 横幅いっぱい（ボードを覆う）。戻すと、元の幅に戻る
  const [maximized, setMaximized] = useStoredFlag(PANEL_MAXIMIZED_KEY);
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const [bodyWidth, setBodyWidth] = useState(0);

  useEffect(() => {
    if (!body) return;
    const observer = new ResizeObserver(() => setBodyWidth(body.clientWidth));
    observer.observe(body);
    return () => observer.disconnect();
  }, [body]);

  /** 狭くてボードを覆っているか（横幅いっぱいとは別。広がれば元の幅に戻る） */
  const covering = leavesNarrowBoard(bodyWidth, panelWidth);

  /**
   * パネルの左端をドラッグして幅を変える（ボードを覆うところまで広げられる）。ドラッグ中は指の位置どおりの幅にし
   * （覆っている状態から右へ動かすと、すぐにボードが見えてくる）、離したときにボードが狭すぎる幅なら覆う
   */
  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!body) return;
    const right = body.getBoundingClientRect().right;
    const max = body.clientWidth;
    // 横幅いっぱい・覆っているときは、今の幅からドラッグを始める（ドラッグすると横幅いっぱいは解除）
    let width = maximized || covering ? max : panelWidth;
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
    covering,
    toggleMaximized: () => setMaximized(!maximized),
    resizing,
    bodyRef: setBody,
    startResize,
    /** 横幅いっぱい・覆うときは、CSS 側の上限（ボードの幅）まで広げる */
    style: { "--panel-w": maximized || covering ? "100vw" : `${panelWidth}px` } as CSSProperties,
  };
}
