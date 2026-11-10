import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, EyeOff, MessageCircleQuestion } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { Attachment } from "@shared/types";
import { cx } from "@/lib/cx";
import { useSetting } from "@/hooks/useSetting";
import { STICKY_PROMPT_EXPANDED, STICKY_PROMPT_HIDDEN } from "@/lib/storageKeys";
import { IconButton } from "@/ui/IconButton";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { AttachmentPeek } from "@/features/chat/attachments/AttachmentPeek";
import { COMPACT_PROMPT_KINDS } from "@/features/snippet/compactPromptKinds";
import type { CompactPromptKind } from "@shared/chat/prompts";
import { CompactPromptMark } from "@/features/snippet/CompactPromptMark";
import { promptBefore, type PromptList } from "./promptHistory";

/** AI からの質問への回答の 1 問（質問の文と選んだ答え） */
export interface PinnedAnswer {
  question: string;
  answer: string;
}

/** 帯に出すもの: 自分の指示か、AI からの質問への回答（answers があれば回答。text は答えだけを並べた 1 行） */
export interface PinnedPrompt {
  id: number;
  text: string;
  answers?: PinnedAnswer[];
  /** 圧縮の前後に送った圧縮前指示・圧縮後指示か */
  compactKind?: CompactPromptKind;
}

/** 同じものを貼り付けたままか（スクロールのたびに描き直さないため） */
export function samePinned(a: PinnedPrompt | undefined, b: PinnedPrompt | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.id !== b.id || a.text !== b.text || a.compactKind !== b.compactKind) return false;
  const qa = a.answers?.map((x) => x.question).join("\n");
  const qb = b.answers?.map((x) => x.question).join("\n");
  return qa === qb;
}

/**
 * チャットの上に置く、いま読んでいる返答の元の自分の指示。いつも出し、流れに重ねずに流れの上の段に置く（スクロールに合わせて中身を変える）。
 * 初めは 1 行にたたみ（長い指示で縦をとらないように）、見出しの右の ↑ / ↓ の隣の矢印で全文を出す（長ければ中でスクロール。開閉はどのチャットでも同じに覚える）。
 * 押して何かが起きるのは、見出しのすぐ右の ↑ / ↓（前・次の指示へ。⌘⌥↑ / ↓ と同じ）とその右の開閉の矢印・添付だけ（見出しと文は押しても何もしない。以前は押すとその発言へ移っていた）。
 * 添付があれば、送信待ちの行と同じく 1 つ目だけを小さく出す（帯の高さは変えない。押すと大きく表示）。
 * 右クリックで、全文の開閉と「指示の帯を隠す」（戻すのはタブの列の「表示」・設定の「表示」）。
 * 読んでいるのが AI からの質問への回答なら、「質問への回答」と添えて、たたんでいる間は答えだけを 1 行に、全文では質問ごとに質問の文と答えを出す。
 * 圧縮前指示・圧縮後指示なら「圧縮前指示」「圧縮後指示」と添える
 */
export function StickyPrompt({
  text,
  answers,
  compactKind,
  attachments,
  onPrev,
  onNext,
}: {
  text: string;
  /** 質問への回答なら、その問いと答え */
  answers?: PinnedAnswer[];
  /** 圧縮前指示・圧縮後指示か */
  compactKind?: CompactPromptKind;
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
  // 回答は、たたんでいる間は質問の文を隠しているので、いつも全文を開ける
  const canExpand = overflowing || (answers?.length ?? 0) > 0;
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
          title={expanded || canExpand ? undefined : "指示は 1 行に収まっています"}
          aria-expanded={expanded}
          size={14}
          disabled={!expanded && !canExpand}
          onClick={() => setExpanded(!expanded)}
        />
      </span>
      <AttachmentPeek attachments={attachments} />
      <span className="sticky-prompt-body" aria-label={answers ? `質問への回答: ${text}` : compactKind ? `${COMPACT_PROMPT_KINDS[compactKind].label}: ${text}` : `指示: ${text}`}>
        {answers && (
          <span className="sticky-prompt-kind">
            <MessageCircleQuestion size={12} aria-hidden />
            質問への回答
          </span>
        )}
        {compactKind && <CompactPromptMark kind={compactKind} className="sticky-prompt-kind" />}
        <span ref={textRef} className="sticky-prompt-text">
          {answers && expanded ? <AnswerList answers={answers} /> : text}
        </span>
      </span>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="指示の帯" onClose={menu.close}>
          {(expanded || canExpand) && (
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

/** 全文で出す、質問ごとの質問の文と答え（吹き出しの「質問への回答」と同じ並び） */
function AnswerList({ answers }: { answers: PinnedAnswer[] }) {
  return (
    <span className="sticky-answer-list">
      {answers.map((a, i) => (
        <span key={i} className="sticky-answer-item">
          <span className="sticky-answer-question">{a.question}</span>
          <span className="sticky-answer-text">{a.answer}</span>
        </span>
      ))}
    </span>
  );
}

/** 質問への回答の吹き出し（`QuestionAnswerMessage`）から、質問ごとの問いと答えを読む */
function answersOf(bubble: HTMLElement): PinnedAnswer[] {
  return [...bubble.querySelectorAll<HTMLElement>(".question-answer-item")].map((item) => ({
    question: item.querySelector("dt")?.textContent?.trim() ?? "",
    answer: item.querySelector("dd:not(.bubble-attachments)")?.textContent?.trim() ?? "",
  }));
}

/** 帯に出している指示を出し続ける線のゆとり（帯の高さの端数をスクロールの位置に丸めた差で、境目を行き来しないように） */
const HOLD_SLACK_PX = 1.5;

/**
 * 帯に出している指示と、それを選んだときの線（流れの枠 `.timeline-wrap` の上端からの距離）。
 * 出している指示の吹き出しは、流れの上端ではなく、この線（と流れの上端の低い方）を越えて下へ戻るまで出し続ける
 */
export interface PinnedHold {
  id: number;
  line: number;
}

/** いまの線（流れの上端 ＋ 1px）を、流れの枠の上端からの距離で（帯に出す指示を選んだときに覚える） */
export function readingLine(timeline: HTMLElement): number {
  const top = timeline.getBoundingClientRect().top;
  return top + 1 - (timeline.parentElement?.getBoundingClientRect().top ?? top);
}

/**
 * いま読んでいる返答の元の自分の発言（帯に出す指示）: 流れの上端まで流れた（上端より上から始まる）いちばん下の吹き出し。
 * 読んでいる位置より上に描いている吹き出しがなければ、見えている最初の項目より前のいちばん新しい指示を記録の一覧（prompts）から出す
 * （流れは最近の項目だけを描く窓なので、1 回の作業でツール・返答が多いと、窓の中に自分の吹き出しが 1 つも入らず、帯が消えていた）。
 * それもなければ（いちばん上を見ている）、最初の吹き出し。吹き出しも指示もなければ undefined。
 * AI からの質問への回答も同じ吹き出しなので数え、問いと答えを添える（文は答えだけを並べた 1 行）。圧縮前指示・圧縮後指示（`.pre-compact` / `.post-compact`）はその印を添える。
 * 帯に出している指示（hold）とそれより前の吹き出しは、選んだときの線まで流れたものとみなす（`PinnedHold`）。
 * 帯の高さは指示ごとに違い（全文を出しているとき）、帯が替わると流れの上端が動くので、上端だけで決めると、
 * 一番下に付いていく間などに、替わった先の高さでまた元の指示に戻り、境目で帯が毎フレーム替わり続けた
 */
export function readingPrompt(timeline: HTMLElement, prompts?: PromptList, hold?: PinnedHold): PinnedPrompt | undefined {
  const timelineTop = timeline.getBoundingClientRect().top;
  const line = timelineTop + 1;
  const holdLine = hold ? Math.max(line, (timeline.parentElement?.getBoundingClientRect().top ?? timelineTop) + hold.line + HOLD_SLACK_PX) : line;
  const bubbles = timeline.querySelectorAll<HTMLElement>(".bubble.user");
  let found: HTMLElement | undefined;
  for (const bubble of bubbles) {
    const held = hold !== undefined && Number(bubble.id.replace("ev-", "")) <= hold.id;
    if (bubble.getBoundingClientRect().top >= (held ? holdLine : line)) break;
    found = bubble;
  }
  if (!found) {
    // 読んでいる位置より上に描いている吹き出しがない（窓の外にある・最初の吹き出しより上を見ている）: 見えている最初の項目より前の指示を記録から
    const first = firstVisibleEventId(timeline, line);
    const before = first !== undefined && prompts ? promptBefore(prompts, first) : undefined;
    if (before) return before.compactKind ? { id: before.id, text: before.text, compactKind: before.compactKind } : { id: before.id, text: before.text };
    found = bubbles[0];
  }
  if (!found) return undefined;
  const id = Number(found.id.replace("ev-", ""));
  if (!Number.isFinite(id)) return undefined;
  if (found.closest(".question-answer")) {
    const answers = answersOf(found);
    return { id, text: answers.map((a) => a.answer).join(" / "), answers };
  }
  // 添付だけの発言は文が空（帯には添付だけを出す）
  const text = found.querySelector(".bubble-text")?.textContent?.trim() ?? "";
  const compactKind = found.closest(".pre-compact") ? "pre" : found.closest(".post-compact") ? "post" : undefined;
  return compactKind ? { id, text, compactKind } : { id, text };
}

/** 流れの上端の線より下に掛かっている、いちばん上の項目の記録の ID（項目の要素の id は `ev-<記録の ID>`。なければ undefined） */
function firstVisibleEventId(timeline: HTMLElement, line: number): number | undefined {
  for (const el of timeline.querySelectorAll<HTMLElement>('[id^="ev-"]')) {
    if (el.getBoundingClientRect().bottom <= line) continue;
    const id = Number(el.id.slice(3));
    if (Number.isFinite(id) && id > 0) return id;
  }
  return undefined;
}
