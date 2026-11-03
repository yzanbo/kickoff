import { ChevronDown, ChevronUp } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { cx } from "../../cx";
import { useStoredFlag } from "../../hooks/useStoredState";
import { STICKY_PROMPT_EXPANDED_KEY } from "../../storageKeys";
import { IconButton } from "../IconButton";

/**
 * チャットの上に貼り付ける、いま読んでいる返答の元の自分の指示。
 * 初めは 1 行にたたみ（長い指示で縦をとらないように）、右の矢印で全文を出す（長ければ中でスクロール。開閉はどのチャットでも同じに覚える）。
 * 指示の文を押すと、その発言へ移る
 */
export function StickyPrompt({ text, onJump }: { text: string; onJump: () => void }) {
  const [expanded, setExpanded] = useStoredFlag(STICKY_PROMPT_EXPANDED_KEY);
  const textRef = useRef<HTMLSpanElement>(null);
  // 1 行に収まらないか（収まるなら開閉の矢印を出さない）。欄の幅が変わったら測り直す
  const [overflowing, setOverflowing] = useState(false);
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    const measure = () => setOverflowing(el.scrollWidth > el.clientWidth + 1 || text.includes("\n"));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);
  return (
    <div className={cx("sticky-prompt", expanded && "expanded")}>
      <button type="button" className="sticky-prompt-jump" title="この発言へ移る" onClick={onJump}>
        <span className="sticky-prompt-label">あなたの指示</span>
        <span ref={textRef} className="sticky-prompt-text">
          {text}
        </span>
      </button>
      {(overflowing || expanded) && (
        <IconButton
          icon={expanded ? ChevronUp : ChevronDown}
          label={expanded ? "1 行にたたむ" : "指示の全文を表示"}
          aria-expanded={expanded}
          size={14}
          className="sticky-prompt-toggle"
          onClick={() => setExpanded(!expanded)}
        />
      )}
    </div>
  );
}
