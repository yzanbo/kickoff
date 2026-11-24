import type { Rectangle } from "electron";
import type { DevtoolsBounds } from "@shared/foundation/ipc";

// 右・下に並べた開発者ツールの置き場所の計算（Electron に依らないので、テストできる）

/**
 * 画面の CSS の px の範囲を、ウィンドウに重ねる表示（WebContentsView）の範囲にする。
 * 画面を拡大・縮小しているときは倍率を掛け、端を整数に丸める（隣の部品との間にすき間・重なりを作らないよう、幅ではなく右下の端を丸める）
 */
export function viewBoundsOf(bounds: DevtoolsBounds, zoom: number): Rectangle {
  const x = Math.round(bounds.x * zoom);
  const y = Math.round(bounds.y * zoom);
  const right = Math.round((bounds.x + bounds.width) * zoom);
  const bottom = Math.round((bounds.y + bounds.height) * zoom);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}
