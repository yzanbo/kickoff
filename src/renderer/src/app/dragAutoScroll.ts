import { edgeScrollStep } from "@/lib/edgeScroll";

/**
 * ドラッグ中に、スクロールできる欄の端へ寄せたら、その欄をスクロールする（利用者の依頼。見えている範囲の外へ落としたいときに、
 * 送信待ちの一覧などがスクロールせず落とせなかった）。アプリ全体（メインのウィンドウ・別ウィンドウ）の HTML のドラッグすべてに効く。
 * dragover でカーソルの位置を覚え、ドラッグの間は 1 フレームごとに、カーソルの下の要素を手前から見て、端の帯に入っていてまだ動ける
 * いちばん手前の欄だけを動かす（中の欄が端まで来たら外の欄。縦と横の両方）。カーソルを止めていても動き続ける。
 * 速さは lib/edgeScroll.ts の edgeScrollStep。写し（startDragGhost）・覆いは pointer-events: none なので邪魔をしない
 */
export function startDragAutoScroll() {
  let x = 0;
  let y = 0;
  let lastAt = 0;
  let frame = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };
  const tick = () => {
    // dragover が途切れた（ウィンドウの外へ出た・落とした）ら止める
    if (performance.now() - lastAt > IDLE_MS) return stop();
    scrollAt(x, y);
    frame = requestAnimationFrame(tick);
  };
  document.addEventListener(
    "dragover",
    (e) => {
      x = e.clientX;
      y = e.clientY;
      lastAt = performance.now();
      if (!frame) frame = requestAnimationFrame(tick);
    },
    true,
  );
  document.addEventListener("drop", stop, true);
  document.addEventListener("dragend", stop, true);
}

/** dragover がこれだけ届かなければ、ドラッグが終わったとみなす（ms。止めていても dragover はおよそ 50ms ごとに届く） */
const IDLE_MS = 200;

const SCROLLABLE = new Set(["auto", "scroll", "overlay"]);

/** 位置 (x, y) の下で、端の帯に入っていてまだ動ける、いちばん手前の欄を 1 フレーム分動かす */
function scrollAt(x: number, y: number) {
  for (const el of document.elementsFromPoint(x, y)) {
    if (!(el instanceof HTMLElement)) continue;
    const dy = verticalStep(el, y);
    const dx = horizontalStep(el, x);
    if (dx || dy) {
      el.scrollBy(dx, dy);
      return;
    }
  }
}

function verticalStep(el: HTMLElement, y: number): number {
  if (el.scrollHeight <= el.clientHeight + 1 || !SCROLLABLE.has(getComputedStyle(el).overflowY)) return 0;
  const rect = el.getBoundingClientRect();
  const step = edgeScrollStep(y, rect.top, rect.bottom);
  if (step < 0 && el.scrollTop <= 0) return 0;
  if (step > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 1) return 0;
  return step;
}

function horizontalStep(el: HTMLElement, x: number): number {
  if (el.scrollWidth <= el.clientWidth + 1 || !SCROLLABLE.has(getComputedStyle(el).overflowX)) return 0;
  const rect = el.getBoundingClientRect();
  const step = edgeScrollStep(x, rect.left, rect.right);
  if (step < 0 && el.scrollLeft <= 0) return 0;
  if (step > 0 && el.scrollLeft + el.clientWidth >= el.scrollWidth - 1) return 0;
  return step;
}
