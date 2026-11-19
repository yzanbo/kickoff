// タブをドラッグするときに付いて動く小さなサムネイル（Zen Browser のタブと同じ見せ方）。
// ウィンドウの外へ離すと別ウィンドウで開くタブ（種類の表の popout）だけ。ウィンドウの外でも見えるよう、画面の中に重ねる写し（startDragGhost）ではなく
// OS のドラッグの絵（setDragImage）にする。OS のドラッグの絵は dragstart の時点で決まるので、タブを押した時点（pointerdown）で中身を撮っておく

/** 用意したサムネイル（タブのキーと、画面の外に置いたカードの要素） */
let prepared: { key: string; card: HTMLElement } | null = null;
/** 撮る頼みの番号（遅れて届いた古い画像を、次のタブのカードに入れない） */
let requestSeq = 0;

/** 画面の外に置くカード（名前の行。撮れたら下に画像を足す） */
function buildCard(title: string, aspect: number | null): HTMLElement {
  const card = document.createElement("div");
  card.className = "tab-drag-thumb";
  const head = document.createElement("div");
  head.className = "tab-drag-thumb-title";
  head.textContent = title;
  card.append(head);
  if (aspect !== null) {
    // 画像が届く前から同じ大きさにしておく（届かなくても、空の面のカードになる）
    const frame = document.createElement("div");
    frame.className = "tab-drag-thumb-frame";
    frame.style.aspectRatio = String(aspect);
    card.append(frame);
  }
  document.body.append(card);
  return card;
}

/**
 * タブを押したときに、ドラッグのサムネイルを用意する（タブの中身が見えていれば撮って画像にする。見えていない（裏の）タブは名前だけのカード）。
 * 撮るのは Mac のアプリだけ（IPC の windows.captureRegion）
 */
export function prepareTabThumbnail(key: string, title: string): void {
  discardTabThumbnail();
  const seq = ++requestSeq;
  const page = document.querySelector<HTMLElement>(`.panel-tab-page[data-tab-key="${CSS.escape(key)}"]`);
  const rect = page && !page.hidden ? page.getBoundingClientRect() : null;
  const visible = rect !== null && rect.width >= 8 && rect.height >= 8;
  const card = buildCard(title, visible ? Math.max(rect.width / rect.height, 1) : null);
  prepared = { key, card };
  const capture = globalThis.window?.kickoff?.windows.captureRegion;
  if (!visible || !capture) return;
  void capture({ x: rect.left, y: rect.top, width: rect.width, height: rect.height }).then((url) => {
    if (!url || seq !== requestSeq || prepared?.card !== card) return;
    const image = document.createElement("img");
    image.className = "tab-drag-thumb-image";
    image.alt = "";
    image.src = url;
    card.querySelector(".tab-drag-thumb-frame")?.append(image);
  });
}

/** そのタブのために用意したサムネイルのカード（なければ null = ふつうのドラッグの絵） */
export const tabThumbnailOf = (key: string): HTMLElement | null => (prepared?.key === key ? prepared.card : null);

/** 用意したサムネイルを捨てる（ドラッグが終わった・押しただけで離した） */
export function discardTabThumbnail(): void {
  prepared?.card.remove();
  prepared = null;
}
