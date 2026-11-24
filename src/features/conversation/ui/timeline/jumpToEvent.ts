/** なめらかに動かすときも、これより遠い（流れの高さの何倍か）ときは近くまで一気に寄せてから動かす（長いチャットで長い時間スクロールさせない） */
import "./jumpFlash.css";
const SMOOTH_MAX_SCREENS = 1.5;
/** スクロールの終わり（scrollend）が届かないときに、強調を始めるまでの上限 */
const SETTLE_TIMEOUT_MS = 1200;
/** 行き先が流れの真ん中からこれ以内（見えている高さに対する割合）なら着いたとみなす */
const ARRIVE_RATIO = 0.25;
/** 動いている間に行が描かれて行き先がずれたとき、寄せ直す回数の上限 */
const MAX_RETRIES = 2;

/** 流れの要素ごとの、前に頼んだ「スクロールし終えたら強調する」（同じ流れで続けて移ったら、前のものはやめる。ほかの画面の流れの待ちは消さない） */
const pendingFlash = new WeakMap<HTMLElement, () => void>();

/**
 * チャットの発言（id が `ev-<イベント ID>` の要素）か、そのツールの呼び出しを含むまとまり（`data-tool-ids`）までスクロールして、一瞬強調する。
 * 検索結果から開いたとき・指示の履歴・⌘⌥↑ / ↓・上に貼り付けた自分の発言・動きの行から移るときに使う（サブエージェントのカードの窓の中にも届く）。見つからなければ false。
 * `smooth` ならなめらかにスクロールし（動きを減らす設定のときは一気に）、スクロールし終えてから強調する（動いている間に強調が薄れて見落とさないように）
 */
export function jumpToEvent(root: HTMLElement, eventId: number, { smooth = false }: { smooth?: boolean } = {}): boolean {
  const target = root.querySelector<HTMLElement>(`#ev-${eventId}`) ?? root.querySelector<HTMLElement>(`[data-tool-ids~="${eventId}"]`);
  if (!target) return false;
  pendingFlash.get(root)?.();
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
  flashWhenSettled(root, target);
  target.scrollIntoView({ block: "center", behavior: "smooth" });
  return true;
}

/** 行き先を真ん中に置くために流れを動かす量（端より先へは動かないので、その分を除く） */
function remaining(root: HTMLElement, target: HTMLElement): number {
  const view = root.getBoundingClientRect();
  const box = target.getBoundingClientRect();
  const wanted = box.top + box.height / 2 - (view.top + view.height / 2);
  const max = root.scrollHeight - root.clientHeight;
  return Math.min(Math.max(root.scrollTop + wanted, 0), max) - root.scrollTop;
}

/**
 * 真ん中に置くために流れを動かす量を返す。
 * 遠ければ、なめらかに動かす前に、流れの高さほど手前まで一気に寄せる（返すのは寄せたあとの残り）
 */
function bringNear(root: HTMLElement, target: HTMLElement): number {
  const view = root.getBoundingClientRect();
  const distance = remaining(root, target);
  if (Math.abs(distance) <= view.height * SMOOTH_MAX_SCREENS) return distance;
  const jump = distance - Math.sign(distance) * view.height;
  root.scrollTop += jump;
  return distance - jump;
}

/**
 * 流れが行き先に着いてスクロールし終えたら強調する。着いたかは、行き先の要素が流れの真ん中あたり（見えている高さの ±25%）にあるかで決める
 * （画面の外の行は描くのを省いて見積もりの高さで並んでいるので、動いている間に行が描かれて高さが変わり、動かし始めたときの行き先の数字とずれる。
 * 動かす前の一瞬の寄せの scrollend も同じ決め方で見分ける）。ずれて止まったら、描けた高さでもう一度寄せる。
 * scrollend が届かないときは、上限の時間で真ん中へ一気に寄せてから強調する
 */
function flashWhenSettled(root: HTMLElement, target: HTMLElement) {
  let timer = 0;
  let retries = MAX_RETRIES;
  const arrived = () => Math.abs(remaining(root, target)) <= root.clientHeight * ARRIVE_RATIO;
  const stop = () => {
    root.removeEventListener("scrollend", onEnd);
    window.clearTimeout(timer);
    if (pendingFlash.get(root) === stop) pendingFlash.delete(root);
  };
  function done() {
    stop();
    flash(target);
  }
  const onTimeout = () => {
    if (!arrived()) target.scrollIntoView({ block: "center" });
    done();
  };
  const onEnd = () => {
    if (arrived()) return done();
    if (retries-- <= 0) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(onTimeout, SETTLE_TIMEOUT_MS);
    target.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  root.addEventListener("scrollend", onEnd);
  timer = window.setTimeout(onTimeout, SETTLE_TIMEOUT_MS);
  pendingFlash.set(root, stop);
}

function flash(target: HTMLElement) {
  target.classList.remove("flash");
  void target.offsetWidth; // アニメーションをやり直すため
  target.classList.add("flash");
  // 光り終えたら外す（光っている間だけ、その行の描くのを省くのをやめているため。Timeline.css）
  const end = (e: AnimationEvent) => {
    if (e.target !== target || e.animationName !== "jump-flash") return;
    target.classList.remove("flash");
    target.removeEventListener("animationend", end);
  };
  target.addEventListener("animationend", end);
}
