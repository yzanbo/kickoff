import { ArrowDown } from "lucide-react";
import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/lib/cx";

export type ScrollPillTone = "waiting" | "arrived" | "working" | "idle" | "failed" | "offline";

/**
 * 一番下へ戻るボタン（上を読んでいる間だけ出す。いまの状態を添え、答えを待っている・返答が届いたときは目立たせて下へ誘う）。
 * チャット欄の上のピルの列に入る幅があれば、その右端に置いて 1 行にまとめる（dock。流れの最後の行に重ならない）。
 * ピルが 1 つもない・狭くて入らないときは、これまでどおり流れの右下の隅に浮かせる（列を 1 行増やすと流れの高さが変わり、画面が動くため）。
 * 入るかは、ピルの幅の合計とこのボタンの幅で決める（置き場所によらず同じ幅なので、置き直しても行き来しない）
 */
export function ScrollBottomPill({
  tone,
  label,
  dock,
  onClick,
}: {
  tone: ScrollPillTone;
  label: ReactNode;
  /** ピルの列の右端の置き場所（ChatPane の .composer-chips-dock） */
  dock: HTMLElement | null;
  onClick: () => void;
}) {
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

  const pill = (
    <button
      ref={setButton}
      type="button"
      className={cx("scroll-bottom guide", tone, (tone === "waiting" || tone === "arrived") && "attention")}
      title="一番下までスクロール（⌘↓）"
      aria-label="一番下までスクロール"
      onClick={onClick}
    >
      {tone === "working" ? (
        <span className="dots" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      ) : (
        <ArrowDown size={14} aria-hidden />
      )}
      <span className="scroll-bottom-label">{label}</span>
      <kbd>⌘↓</kbd>
    </button>
  );
  return docked && dock ? createPortal(pill, dock) : pill;
}
