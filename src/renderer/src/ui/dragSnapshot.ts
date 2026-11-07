import type { DragEvent } from "react";

/** ドラッグの絵を写す瞬間だけ付けるクラス（styles/ui/drag-snapshot.css。背景を半透明にし、薄い枠を付ける） */
const SNAPSHOT_CLASS = "drag-snapshot";

/**
 * ドラッグの絵の背景を半透明にする（dragstart から呼ぶ）。Chromium は dragstart の処理が終わったすぐあとに、つかんだ要素をそのときの見た目
 * （乗せたときの背景色も）ごと写して絵にするので、写す間だけ .drag-snapshot を付け、次の回で外す。背景が半透明になり、カーソルの下の
 * 「入る位置の線」・落とし先の点線の枠が透けて見える（既定の絵は背景ごと写し、透け具合も約 75% で決まっていて、下が隠れていた）。
 * setDragImage は呼ばないので、つかんだ位置がカーソルの下に来るいつもの振る舞いのまま。
 * after: ドラッグ中の見た目を変える state（動かしている物を薄くするなど）はここで変える。dragstart の中で変えると、写す前に描き直されて
 * クラスが消える・薄い見た目のまま写るため、外したあとに回す。送信待ちは自作の写し（queueDragImage.ts）なので使わない
 */
export function markDragSnapshot(e: DragEvent<Element>, after?: () => void): void {
  const el = e.currentTarget;
  el.classList.add(SNAPSHOT_CLASS);
  setTimeout(() => {
    el.classList.remove(SNAPSHOT_CLASS);
    after?.();
  }, 0);
}
