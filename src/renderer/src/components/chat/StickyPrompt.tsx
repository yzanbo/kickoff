import { ArrowDown, ArrowUp, ChevronDown, ChevronUp } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { Attachment, RunEvent } from "../../../../core/types";
import { cx } from "../../cx";
import { useStoredFlag } from "../../hooks/useStoredState";
import { STICKY_PROMPT_EXPANDED_KEY } from "../../storageKeys";
import { IconButton } from "../IconButton";
import { AttachmentPeek } from "./AttachmentPeek";

/**
 * チャットの上に貼り付ける、いま読んでいる返答の元の自分の指示。
 * 初めは 1 行にたたみ（長い指示で縦をとらないように）、右の矢印で全文を出す（長ければ中でスクロール。開閉はどのチャットでも同じに覚える）。
 * 指示の文を押すと、その発言へ移る。右の ↑ / ↓ で前・次の指示へ移る（⌘⌥↑ / ↓ と同じ）。添付があれば、送信待ちの行と同じく 1 つ目だけを小さく出す（帯の高さは変えない。押すと大きく表示）
 */
export function StickyPrompt({
  text,
  attachments,
  onJump,
  onPrev,
  onNext,
}: {
  text: string;
  attachments: Attachment[];
  onJump: () => void;
  /** 前・次の指示へ移る（ないときは押せない。⌘⌥↑ / ↓ と同じ） */
  onPrev?: () => void;
  onNext?: () => void;
}) {
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
      {/* 見出しも押すとその発言へ（添付は送信待ちの行と同じく文の前。押すと大きく表示するので、移るボタンの外に置く） */}
      <span className="sticky-prompt-label" aria-hidden onClick={onJump}>
        指示
      </span>
      <AttachmentPeek attachments={attachments} />
      <button type="button" className="sticky-prompt-jump" title="この発言へ移る" aria-label={`指示: ${text}`} onClick={onJump}>
        <span ref={textRef} className="sticky-prompt-text">
          {text}
        </span>
      </button>
      {/* 前・次の指示へ（開閉の矢印と見分けるため、移る向きの矢印） */}
      <span className="sticky-prompt-nav">
        <IconButton icon={ArrowUp} label="前の指示へ" title="前の指示へ（⌘⌥↑）" size={14} disabled={!onPrev} onClick={onPrev} />
        <IconButton icon={ArrowDown} label="次の指示へ" title="次の指示へ（⌘⌥↓）" size={14} disabled={!onNext} onClick={onNext} />
      </span>
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

/** 貼り付けた指示の帯の高さが分からないとき（まだ出していない）の目安（1 行にたたんだ高さ） */
export const STICKY_PROMPT_HEIGHT = 37;

/**
 * 画面の上に流れて見えなくなった、いちばん下の自分の発言（その返答を読んでいる）。どれも流れていなければ undefined。
 * cover は上に貼り付ける帯の高さで、帯の下端を「見えている」かどうかの線にする（上端を線にすると、次の指示の吹き出しが
 * 帯の下に入り込んでも帯を出したままになり、吹き出しが隠れていた。帯の下端まで来たら帯を引っ込める）
 */
export function promptAbove(timeline: HTMLElement, cover = 0): { id: number; text: string } | undefined {
  const top = timeline.getBoundingClientRect().top + cover;
  // 線より上から始まる、いちばん下の吹き出し（それがまだ少しでも線の下に見えていれば、貼り付けない）
  let found: HTMLElement | undefined;
  for (const bubble of timeline.querySelectorAll<HTMLElement>(".bubble.user")) {
    if (bubble.getBoundingClientRect().top >= top) break;
    found = bubble;
  }
  if (found && found.getBoundingClientRect().bottom > top) return undefined;
  const id = found ? Number(found.id.replace("ev-", "")) : NaN;
  if (!found || !Number.isFinite(id)) return undefined;
  // 添付だけの発言は文が空（帯には添付だけを出す）
  const text = found.querySelector(".bubble-text")?.textContent?.trim() ?? "";
  return { id, text };
}

/** 貼り付けた指示（記録の ID）の添付（なければ空） */
export function promptAttachments(events: RunEvent[], id: number): Attachment[] {
  const event = events.find((e) => e.id === id);
  return (event?.data as { attachments?: Attachment[] } | undefined)?.attachments ?? NO_ATTACHMENTS;
}

const NO_ATTACHMENTS: Attachment[] = [];
