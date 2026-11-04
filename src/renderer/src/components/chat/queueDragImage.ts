import type { DragEvent } from "react";

/** ブラウザの既定のドラッグの絵を消すための、透明な 1 px の画像（先に読み込んでおく） */
const BLANK = new Image();
BLANK.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";

/**
 * 送信待ちのドラッグの絵: つかんだ行（一時停止の線）をそのまま写して半透明にし、つかんだところがカーソルの下にあるまま、
 * カーソルに素直に付いて動かす（ブラウザの既定のドラッグの絵は透け方を決められず、以前の小さな札はカーソルから離れていて、どこに落とすのか分かりにくかった）。
 * 既定の絵は透明にして、写しを画面のいちばん上に重ね、ドラッグの間はカーソルの位置（dragover）に合わせて動かす。半透明なので、下の「入る位置の線」も透けて見える。
 * count: まとめて動かすときの件数（写しの右上に「n 件」と添える）
 */
export function startQueueDragGhost(e: DragEvent<HTMLElement>, count = 1) {
  const source = e.currentTarget.closest<HTMLElement>(".queued-row, .queued-stop-line");
  if (!source) return;
  e.dataTransfer.setDragImage(BLANK, 0, 0);
  const rect = source.getBoundingClientRect();
  // つかんだ位置（行の左上から）。ドラッグの間、この点がカーソルの下に来るように写しを置く
  const grabX = e.clientX - rect.left;
  const grabY = e.clientY - rect.top;

  // 写しは送信待ちの枠と同じ見た目の入れ物（.queued-messages）に入れる（行の見た目は枠の中の規則で決まるため）
  const ghost = document.createElement("div");
  ghost.className = "queued-messages queued-drag-ghost";
  ghost.style.width = `${rect.width + 16}px`;
  const row = source.cloneNode(true) as HTMLElement;
  row.classList.remove("dragging", "selected", "drop-before", "drop-after");
  ghost.appendChild(row);
  if (count > 1) {
    const badge = document.createElement("span");
    badge.className = "queued-drag-count";
    badge.textContent = `${count} 件`;
    ghost.appendChild(badge);
  }
  document.body.appendChild(ghost);
  // 入れ物の余白（左 8px・上 4px）の分だけずらして、写しの行をもとの行と同じ位置から動かし始める
  const place = (x: number, y: number) => {
    ghost.style.transform = `translate(${Math.round(x - grabX - 8)}px, ${Math.round(y - grabY - 4)}px)`;
  };
  place(e.clientX, e.clientY);

  const move = (ev: globalThis.DragEvent) => {
    // ウィンドウの外へ出た・落とす直前は 0, 0 が届くことがあるので見ない
    if (ev.clientX === 0 && ev.clientY === 0) return;
    place(ev.clientX, ev.clientY);
  };
  const end = () => {
    document.removeEventListener("dragover", move, true);
    document.removeEventListener("drop", end, true);
    document.removeEventListener("dragend", end, true);
    ghost.remove();
  };
  document.addEventListener("dragover", move, true);
  document.addEventListener("drop", end, true);
  document.addEventListener("dragend", end, true);
}
