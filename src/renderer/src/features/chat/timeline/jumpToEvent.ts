/** なめらかに動かすときも、これより遠い（流れの高さの何倍か）ときは近くまで一気に寄せてから動かす（長いチャットで長い時間スクロールさせない） */
const SMOOTH_MAX_SCREENS = 1.5;
/** スクロールの終わり（scrollend）が届かないときに、強調を始めるまでの上限 */
const SETTLE_TIMEOUT_MS = 1200;

/** 前に頼んだ「スクロールし終えたら強調する」（続けて移ったら、前のものはやめる） */
let pendingFlash: (() => void) | null = null;

/**
 * チャットの発言（id が `ev-<イベント ID>` の要素）か、そのツールの呼び出しを含むまとまり（`data-tool-ids`）までスクロールして、一瞬強調する。
 * 検索結果から開いたとき・指示の履歴・⌘⌥↑ / ↓・上に貼り付けた自分の発言・動きの行から移るときに使う（サブエージェントのカードの窓の中にも届く）。見つからなければ false。
 * `smooth` ならなめらかにスクロールし（動きを減らす設定のときは一気に）、スクロールし終えてから強調する（動いている間に強調が薄れて見落とさないように）
 */
export function jumpToEvent(root: HTMLElement, eventId: number, { smooth = false }: { smooth?: boolean } = {}): boolean {
  const target = root.querySelector<HTMLElement>(`#ev-${eventId}`) ?? root.querySelector<HTMLElement>(`[data-tool-ids~="${eventId}"]`);
  if (!target) return false;
  pendingFlash?.();
  if (!smooth || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    target.scrollIntoView({ block: "center" });
    flash(target);
    return true;
  }
  const distance = bringNear(root, target);
  // 動かす必要がなければ（もう真ん中にある・端で止まる）、すぐ強調する（scrollend は来ない）
  if (Math.abs(distance) < 1) {
    flash(target);
    return true;
  }
  flashWhenSettled(root, target, root.scrollTop + distance);
  target.scrollIntoView({ block: "center", behavior: "smooth" });
  return true;
}

/**
 * 真ん中に置くために流れを動かす量（端より先へは動かないので、その分を除く）を返す。
 * 遠ければ、なめらかに動かす前に、流れの高さほど手前まで一気に寄せる（返すのは寄せたあとの残り）
 */
function bringNear(root: HTMLElement, target: HTMLElement): number {
  const view = root.getBoundingClientRect();
  const box = target.getBoundingClientRect();
  const wanted = box.top + box.height / 2 - (view.top + view.height / 2);
  const max = root.scrollHeight - root.clientHeight;
  const distance = Math.min(Math.max(root.scrollTop + wanted, 0), max) - root.scrollTop;
  if (Math.abs(distance) <= view.height * SMOOTH_MAX_SCREENS) return distance;
  const jump = distance - Math.sign(distance) * view.height;
  root.scrollTop += jump;
  return distance - jump;
}

/**
 * 流れが行き先（dest）に着いてスクロールし終えたら強調する（scrollend が届かない・行き先がずれたときは、上限の時間で）。
 * 動かす前の一瞬の位置合わせ（窓の描き直し・寄せる）の scrollend も届くので、行き先に着いたかで見分ける
 */
function flashWhenSettled(root: HTMLElement, target: HTMLElement, dest: number) {
  let timer = 0;
  const stop = () => {
    root.removeEventListener("scrollend", onEnd);
    window.clearTimeout(timer);
    if (pendingFlash === stop) pendingFlash = null;
  };
  function done() {
    stop();
    flash(target);
  }
  const onEnd = () => {
    if (Math.abs(root.scrollTop - dest) <= 2) done();
  };
  root.addEventListener("scrollend", onEnd);
  timer = window.setTimeout(done, SETTLE_TIMEOUT_MS);
  pendingFlash = stop;
}

function flash(target: HTMLElement) {
  target.classList.remove("flash");
  void target.offsetWidth; // アニメーションをやり直すため
  target.classList.add("flash");
}
