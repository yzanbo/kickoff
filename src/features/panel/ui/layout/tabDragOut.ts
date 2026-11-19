// タブをウィンドウの外へドラッグして離したか（離したら、そのタブを別ウィンドウで開く。Chrome のタブと同じ）

/** dragend の知らせのうち、見分けに使うもの */
export interface DragEndPoint {
  /** ウィンドウの中の位置（外で離すと、外の位置 = 負・幅や高さより大きい値になる） */
  clientX: number;
  clientY: number;
  /** どこかが受け取ったか（受け取らなければ "none"） */
  dropEffect: string;
}

/**
 * ウィンドウの外で離したか: どこも受け取らず（"none"）、離した位置がウィンドウの外。
 * ウィンドウの中で落とし先のない所に離した・Esc でやめたときは、位置が中なので開かない
 */
export function endedOutsideWindow(end: DragEndPoint, view: { width: number; height: number }): boolean {
  if (end.dropEffect !== "none") return false;
  return end.clientX < 0 || end.clientY < 0 || end.clientX >= view.width || end.clientY >= view.height;
}
