import { useLayoutEffect, useRef, useState } from "react";
import { useWindowEvent } from "../hooks/useWindowEvent";

/** 乗せてから出すまで（OS の title は 1 秒以上待つので、それより早く） */
const SHOW_DELAY_MS = 350;
/** 画面の端・ボタンとの間 */
const MARGIN = 8;

interface Tip {
  title?: string;
  text: string;
  anchor: DOMRect;
}

/**
 * マウスを乗せたときの説明（アプリ全体で 1 つ。App が置く）。data-tip（説明）と data-tip-title（見出し。省ける）を付けた要素に
 * 乗せると、少し待ってその上（入らなければ下）に出す。OS の title より早く出て、見出しと説明を分けて読める。
 * ダイアログ（top layer）の上にも出るよう popover で出す。押した・キーを押した・スクロールした・離れたら消す
 */
export function HoverTip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const target = useRef<Element | null>(null);
  const timer = useRef<number>(undefined);

  const hide = () => {
    window.clearTimeout(timer.current);
    target.current = null;
    setTip(null);
  };

  useWindowEvent(
    "pointerover",
    (e) => {
      const el = e.target instanceof Element ? e.target.closest("[data-tip]") : null;
      if (el === target.current) return;
      hide();
      if (!el) return;
      target.current = el;
      timer.current = window.setTimeout(() => {
        const text = el.getAttribute("data-tip");
        if (!text || !el.isConnected) return;
        setTip({ title: el.getAttribute("data-tip-title") ?? undefined, text, anchor: el.getBoundingClientRect() });
      }, SHOW_DELAY_MS);
    },
    true,
    true,
  );
  // 要素から出た（中の子へ移っただけなら消さない）
  useWindowEvent(
    "pointerout",
    (e) => {
      const next = e.relatedTarget instanceof Node ? e.relatedTarget : null;
      if (target.current && !(next && target.current.contains(next))) hide();
    },
    true,
    true,
  );
  useWindowEvent("pointerdown", hide, true, true);
  useWindowEvent("keydown", hide, true, true);
  useWindowEvent("scroll", hide, true, true);
  useWindowEvent("blur", hide);

  // 出したら大きさを測って、ボタンの上（入らなければ下）の真ん中に置き、画面の中に収める
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!tip) {
      if (el.matches(":popover-open")) el.hidePopover();
      return;
    }
    if (!el.matches(":popover-open")) el.showPopover();
    const { width, height } = el.getBoundingClientRect();
    const a = tip.anchor;
    const above = a.top - height - MARGIN;
    const top = above >= MARGIN ? above : Math.min(window.innerHeight - height - MARGIN, a.bottom + MARGIN);
    const left = Math.max(MARGIN, Math.min(window.innerWidth - width - MARGIN, a.left + a.width / 2 - width / 2));
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
  }, [tip]);

  return (
    <div ref={ref} popover="manual" className="hover-tip" role="tooltip">
      {tip?.title && <strong className="hover-tip-title">{tip.title}</strong>}
      {tip && <span className="hover-tip-text">{tip.text}</span>}
    </div>
  );
}

/**
 * 「名前（説明）」の形の文を、見出しと説明に分けて data-tip の属性にする（アイコンだけの選択肢の label をそのまま使う）。
 * 括弧がなければ全体を説明にする
 */
export function tipProps(label: string): { "data-tip": string; "data-tip-title"?: string } {
  const m = /^(.+?)（(.+)）$/s.exec(label);
  return m ? { "data-tip-title": m[1], "data-tip": m[2] } : { "data-tip": label };
}
