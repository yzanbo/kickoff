import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * 流れの上に重ねるボタン（一番下へ戻るボタン・既読ボタン）の置き場所。
 * チャット欄の上のピルの列に入る幅があれば、その右端（dock）に置いて 1 行にまとめる（流れの最後の行に重ならない）。
 * ピルが 1 つもない・狭くて入らないときは、流れの右下の隅に浮かせる（列を 1 行増やすと流れの高さが変わり、画面が動くため）。
 * 入るかは、ピルの幅の合計とボタンの幅で決める（置き場所によらず同じ幅なので、置き直しても行き来しない）。
 * ref をボタンに付け、place でボタンを包んで描く
 */
export function usePillDock(dock: HTMLElement | null) {
  const [button, setButton] = useState<HTMLButtonElement | null>(null);
  const [docked, setDocked] = useState(false);
  useLayoutEffect(() => {
    const row = dock?.parentElement;
    if (!dock || !row || !button) {
      setDocked(false);
      return;
    }
    const chips = () => [...row.children].filter((c): c is HTMLElement => c !== dock && c instanceof HTMLElement);
    const check = () => {
      const others = chips();
      if (others.length === 0) return setDocked(false);
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const used = others.reduce((sum, c) => sum + c.getBoundingClientRect().width, 0) + gap * others.length;
      setDocked(used + button.getBoundingClientRect().width <= row.clientWidth);
    };
    // 列の幅・ピルの幅（数が変わる）・ボタンの幅（文が変わる）が変わったら測り直す。ピルが増えた・減ったら見張り直す
    const resize = new ResizeObserver(check);
    const watch = () => {
      resize.disconnect();
      for (const el of [row, button, ...chips()]) resize.observe(el);
      check();
    };
    const mutation = new MutationObserver(watch);
    mutation.observe(row, { childList: true });
    watch();
    return () => {
      resize.disconnect();
      mutation.disconnect();
    };
  }, [dock, button]);
  return {
    ref: setButton,
    place: (pill: ReactNode) => (docked && dock ? createPortal(pill, dock) : pill),
  };
}
