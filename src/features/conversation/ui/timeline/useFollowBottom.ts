import { useLayoutEffect, useRef, type RefObject } from "react";
import { observeSize } from "@/foundation/ui/hooks/useSizeObserver";
import { scrollsUpKey, snapTarget } from "@/features/chat/ui";
import { onEditable } from "@/features/conversation/ui/messages/quotable";
import type { TimelineScroll } from "./timelineScroll";

/**
 * 一番下に付いていく間、流れの枠（.timeline）か中身（.timeline-inner）の大きさが変わったら一番下へ寄せる。
 * 中身が伸びるもの（書いている途中の文・新しい項目・確認のカード・作業中の行と圧縮中の行の入れ替わり・図が描けた・コードに色が付いた）は
 * すべて中身の大きさの知らせ、枠が縮むもの（チャット欄が伸びた・上に貼り付ける指示の帯の高さ・窓の大きさ）は枠の知らせで届く。
 * 知らせはレイアウトのあと・描く前に届くので、ここで scrollHeight を読んでもレイアウトを強いない。
 * 上へ戻す操作（ホイールで上へ・↑ / PageUp / Home / Shift+Space・スクロールバーを掴む）は、スクロールの知らせより先に付いていきをやめる（holdUp）。
 * スクロールし終えたら（scrollend・スクロールバーを離した）settle を呼ぶ（上へ戻している途中の印を外し、一番下の近くならまた付いていく）
 */
export function useFollowBottom(scroll: TimelineScroll, inner: RefObject<HTMLElement | null>, settle: (el: HTMLElement) => void) {
  const settleRef = useRef(settle);
  useLayoutEffect(() => {
    settleRef.current = settle;
  });
  useLayoutEffect(() => {
    const el = scroll.ref.current;
    const content = inner.current;
    if (!el || !content) return;
    const snap = () => {
      if (!scroll.following()) return;
      const top = snapTarget(el);
      if (top !== null) el.scrollTop = top;
    };
    // 付いていく間に上へ戻し始めたら、その場でやめる（枠が上へ動けるときだけ）
    const holdUp = () => {
      if (scroll.following() && el.scrollTop > 0) scroll.holdUp();
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0 && scroll.following() && !innerScrollsUp(e.target, el)) holdUp();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (scrollsUpKey(e) && !onEditable(e.target)) holdUp();
    };
    const onPointerDown = (e: PointerEvent) => {
      // スクロールバー（枠そのものの、中身の幅より右）を掴んだ
      if (e.target !== el || e.offsetX < el.clientWidth) return;
      holdUp();
      window.addEventListener("pointerup", () => settleRef.current(el), { once: true });
    };
    const onScrollEnd = () => settleRef.current(el);
    const offs = [observeSize(el, snap), observeSize(content, snap)];
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("keydown", onKeyDown);
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("scrollend", onScrollEnd);
    return () => {
      for (const off of offs) off();
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("keydown", onKeyDown);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("scrollend", onScrollEnd);
    };
  }, [scroll, inner]);
}

/** ホイールを回した所が、流れの中のまだ上へ動ける欄（サブエージェントの手順の窓・出力の欄など）の中か（そちらが動くので、流れは動かない） */
function innerScrollsUp(target: EventTarget | null, root: HTMLElement): boolean {
  for (let node = target instanceof Element ? target : null; node && node !== root; node = node.parentElement) {
    if (node.scrollTop > 0 && node.scrollHeight > node.clientHeight) return true;
  }
  return false;
}
