import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, EyeOff } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { Attachment } from "@shared/types";
import { cx } from "@/lib/cx";
import { useSetting } from "@/hooks/useSetting";
import { STICKY_PROMPT_EXPANDED, STICKY_PROMPT_HIDDEN } from "@/lib/storageKeys";
import { IconButton } from "@/ui/IconButton";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { AttachmentPeek } from "@/features/chat/attachments/AttachmentPeek";

/**
 * チャットの上に置く、いま読んでいる返答の元の自分の指示。いつも出し、流れに重ねずに流れの上の段に置く（スクロールに合わせて中身を変える）。
 * 初めは 1 行にたたみ（長い指示で縦をとらないように）、見出しの右の ↑ / ↓ の隣の矢印で全文を出す（長ければ中でスクロール。開閉はどのチャットでも同じに覚える）。
 * 押して何かが起きるのは、見出しのすぐ右の ↑ / ↓（前・次の指示へ。⌘⌥↑ / ↓ と同じ）とその右の開閉の矢印・添付だけ（見出しと文は押しても何もしない。以前は押すとその発言へ移っていた）。
 * 添付があれば、送信待ちの行と同じく 1 つ目だけを小さく出す（帯の高さは変えない。押すと大きく表示）。
 * 右クリックで、全文の開閉と「指示の帯を隠す」（戻すのはタブの列の「表示」・設定の「表示」）
 */
export function StickyPrompt({
  text,
  attachments,
  onPrev,
  onNext,
}: {
  text: string;
  attachments: Attachment[];
  /** 前・次の指示へ移る（ないときは押せない。⌘⌥↑ / ↓ と同じ） */
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const [expanded, setExpanded] = useSetting(STICKY_PROMPT_EXPANDED);
  const [, setHidden] = useSetting(STICKY_PROMPT_HIDDEN);
  const menu = useContextMenu();
  const textRef = useRef<HTMLSpanElement>(null);
  // 1 行に収まらないか（収まるなら開閉の矢印を押せなくする）。欄の幅が変わったら測り直す
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
    <div
      className={cx("sticky-prompt", expanded && "expanded")}
      onContextMenu={(e) => {
        // 添付・ボタンの上では、そのものの右クリックを残す
        if ((e.target as HTMLElement).closest("button")) return;
        menu.open(e);
      }}
    >
      {/* 見出しと文は押しても何もしない（添付は送信待ちの行と同じく文の前） */}
      <span className="sticky-prompt-label" aria-hidden>
        指示
      </span>
      {/*
        前・次の指示へと、全文の開閉（見出しのすぐ右にまとめる。文の長さ・添付で位置が動かない。開閉の矢印と見分けるため、移るのは向きの矢印）。
        開閉は 1 行に収まるときも場所を取ったまま押せなくし、出し入れで文の位置を動かさない
      */}
      <span className="sticky-prompt-nav">
        <IconButton icon={ArrowUp} label="前の指示へ" title="前の指示へ（⌘⌥↑）" size={14} disabled={!onPrev} onClick={onPrev} />
        <IconButton icon={ArrowDown} label="次の指示へ" title="次の指示へ（⌘⌥↓）" size={14} disabled={!onNext} onClick={onNext} />
        <IconButton
          icon={expanded ? ChevronUp : ChevronDown}
          label={expanded ? "1 行にたたむ" : "指示の全文を表示"}
          title={expanded || overflowing ? undefined : "指示は 1 行に収まっています"}
          aria-expanded={expanded}
          size={14}
          disabled={!expanded && !overflowing}
          onClick={() => setExpanded(!expanded)}
        />
      </span>
      <AttachmentPeek attachments={attachments} />
      <span className="sticky-prompt-body" aria-label={`指示: ${text}`}>
        <span ref={textRef} className="sticky-prompt-text">
          {text}
        </span>
      </span>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="指示の帯" onClose={menu.close}>
          {(expanded || overflowing) && (
            <MenuItem onSelect={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {expanded ? "1 行にたたむ" : "指示の全文を表示"}
            </MenuItem>
          )}
          <MenuItem title="戻すときは、タブの列の「表示」か設定の「表示」から" onSelect={() => setHidden(true)}>
            <EyeOff size={14} /> 指示の帯を隠す
          </MenuItem>
        </PopupMenu>
      )}
    </div>
  );
}

/**
 * いま読んでいる返答の元の自分の発言（帯に出す指示）: 流れの上端まで流れた（上端より上から始まる）いちばん下の吹き出し。
 * どれも流れていなければ（いちばん上を見ている）、最初の吹き出し。吹き出しがなければ undefined。
 * 帯は流れの上に置き、流れに重ねないので、流れの上端をそのまま線にする
 */
export function readingPrompt(timeline: HTMLElement): { id: number; text: string } | undefined {
  const line = timeline.getBoundingClientRect().top + 1;
  const bubbles = timeline.querySelectorAll<HTMLElement>(".bubble.user");
  let found: HTMLElement | undefined = bubbles[0];
  for (const bubble of bubbles) {
    if (bubble.getBoundingClientRect().top >= line) break;
    found = bubble;
  }
  if (!found) return undefined;
  const id = Number(found.id.replace("ev-", ""));
  if (!Number.isFinite(id)) return undefined;
  // 添付だけの発言は文が空（帯には添付だけを出す）
  const text = found.querySelector(".bubble-text")?.textContent?.trim() ?? "";
  return { id, text };
}
