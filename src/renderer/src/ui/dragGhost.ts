import type { DragEvent } from "react";

/** 透明な 1 px の GIF */
const BLANK_SRC = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";

function loadBlank(): HTMLImageElement {
  const image = new Image();
  image.src = BLANK_SRC;
  return image;
}

/**
 * ブラウザの既定のドラッグの絵を消すための、透明な 1 px の画像。読み込んだ時点で作っておく（data: の画像でも読み込みは後から済むので、
 * dragstart の中で初めて作ると読み込みが間に合わず、既定の絵（つかんだ物の濃い写し。OS が窓の上に描く）が出て、写しの下の線・枠を隠した）。
 * 読み込むだけのテストの Node には Image がないので、そのときは初めて使うときに作る
 */
let blank: HTMLImageElement | null = typeof Image === "undefined" ? null : loadBlank();
function blankImage(): HTMLImageElement {
  blank ??= loadBlank();
  return blank;
}

/** 動かしている物の印（styles/ui/drag-ghost.css で薄くする。React が触らない属性なので、ドラッグ中に描き直されても消えない） */
const SOURCE_ATTR = "data-drag-source";

/** 写しから外す、その場の様子のクラス（動かしている・選んでいる・落とす位置の印） */
const TRANSIENT_CLASSES = ["dragging", "selected", "drop-before", "drop-after", "drop-target"];

interface DragGhostOptions {
  /** 写して薄くする物（初めは e.currentTarget。つまみだけをドラッグできる行は、行を渡す） */
  source?: Element | null;
  /** まとめて動かすときの件数（写しの右上に「n 件」と添える） */
  count?: number;
  /**
   * ドラッグ中の見た目を変える state（動かしているものの印・覆い）は、ここで変える。dragstart の中で描き直すと、
   * ドラッグが取り消されることがあるので、次の回に回す
   */
  after?: () => void;
}

/**
 * ドラッグの絵（dragstart から呼ぶ。アプリのどのドラッグもこれを使う）: つかんだ物をそのまま写して半透明にし、つかんだところがカーソルの下にあるまま、
 * カーソルに素直に付いて動かす。ブラウザの既定の絵は文字・アイコンが濃いまま写り、透け方も決められず、下の「入る位置の線」・落とし先の枠が見えにくかった
 * （送信待ちで作った見せ方を、アプリ全体にそろえた）。既定の絵は透明にして、写しを画面のいちばん上に重ね、ドラッグの間は dragover に合わせて動かす。
 * 動かしている物は、ドラッグの間だけ薄くする
 */
export function startDragGhost(e: DragEvent<Element>, { source, count = 1, after }: DragGhostOptions = {}): void {
  const el = source ?? e.currentTarget;
  if (!(el instanceof HTMLElement)) return;
  e.dataTransfer.setDragImage(blankImage(), 0, 0);
  const rect = el.getBoundingClientRect();
  // つかんだ位置（物の左上から）。ドラッグの間、この点がカーソルの下に来るように写しを置く
  const grabX = e.clientX - rect.left;
  const grabY = e.clientY - rect.top;

  const ghost = document.createElement("div");
  ghost.className = "drag-ghost";
  const frame = document.createElement("div");
  frame.className = "drag-ghost-frame";
  const { root, clone } = cloneInPlace(el, rect);
  frame.appendChild(root);
  ghost.appendChild(frame);
  if (count > 1) {
    const badge = document.createElement("span");
    badge.className = "drag-ghost-count";
    badge.textContent = `${count} 件`;
    ghost.appendChild(badge);
  }
  // メニュー（popover）・ダイアログの中の物は、その中に置く（画面のいちばん上の層に出ているので、body に置くと写しがその下に隠れる）
  (el.closest(":popover-open, dialog:modal") ?? document.body).appendChild(ghost);
  // 自分の地がある物（カード）は、写しの枠の地・余白を付けず、物の角に合わせる（地のない行・タブは、送信待ちと同じ枠の地に載せる）
  const style = getComputedStyle(clone);
  if (style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== "transparent") {
    frame.classList.add("bare");
    frame.style.borderRadius = style.borderRadius;
  }
  // 枠の余白と線の分だけずらして、写しの物をもとの物と同じ位置から動かし始める
  const offsetX = clone.getBoundingClientRect().left - ghost.getBoundingClientRect().left;
  const offsetY = clone.getBoundingClientRect().top - ghost.getBoundingClientRect().top;
  const place = (x: number, y: number) => {
    ghost.style.transform = `translate(${Math.round(x - grabX - offsetX)}px, ${Math.round(y - grabY - offsetY)}px)`;
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
    el.removeAttribute(SOURCE_ATTR);
  };
  document.addEventListener("dragover", move, true);
  document.addEventListener("drop", end, true);
  document.addEventListener("dragend", end, true);
  setTimeout(() => {
    // すぐに落とした（end が先に済んだ）ときは印を付けない
    if (ghost.isConnected) el.setAttribute(SOURCE_ATTR, "");
    after?.();
  }, 0);
}

/**
 * 物を、もとの場所と同じ見た目のまま写す。行・タブの見た目は「サイドバーの中の行」のように先祖の要素の規則で決まるので、
 * 先祖の要素を同じタグ・クラス・属性で組み直して箱を作らない入れ物（display: contents）にし、その中に写しを入れる
 * （先祖のクラスに付く規則・受け継ぐ色や変数がそのまま効き、先祖の地・余白・並べ方は効かない）
 */
function cloneInPlace(el: HTMLElement, rect: DOMRect): { root: HTMLElement; clone: HTMLElement } {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  clone.removeAttribute(SOURCE_ATTR);
  clone.classList.remove(...TRANSIENT_CLASSES);
  for (const node of clone.querySelectorAll("[id]")) node.removeAttribute("id");
  // 並べ方（flex・grid・sticky・位置の指定）から外れても、もとと同じ大きさで描く
  Object.assign(clone.style, {
    position: "relative",
    inset: "auto",
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    maxWidth: "none",
    minWidth: "0",
    margin: "0",
    flex: "none",
    boxSizing: "border-box",
    transform: "none",
    transition: "none",
    animation: "none",
    opacity: "1",
  });

  let root: HTMLElement = clone;
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    const copy = document.createElement(p.tagName.toLowerCase());
    for (const attr of p.attributes) if (attr.name !== "id") copy.setAttribute(attr.name, attr.value);
    copy.style.display = "contents";
    copy.appendChild(root);
    root = copy;
  }
  return { root, clone };
}
