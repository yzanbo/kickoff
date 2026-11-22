import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, MessageCircleQuestion } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { Attachment } from "@shared/chat/types";
import { cx } from "@/foundation/ui/lib/cx";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { storage } from "@/features/conversation/ui/storage";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { AttachmentPeek } from "@/features/attachments/ui";
import { ChatDisplayItems } from "@/features/conversation/ui/screen/ChatDisplayMenu";
import { COMPACT_PROMPT_KINDS } from "@/features/compact/ui/compactPromptKinds";
import { CompactPromptMark } from "@/features/compact/ui/CompactPromptMark";
import type { PromptEntry } from "./promptHistory";

/**
 * チャットの上に置く、いま読んでいる返答の元の自分の指示。いつも出し、流れに重ねずに流れの上の段に置く（スクロールに合わせて中身を変える）。
 * 初めは 1 行にたたみ（長い指示で縦をとらないように）、見出しの右の ↑ / ↓ の隣の矢印で全文を出す（長ければ中でスクロール。開閉はどのチャットでも同じに覚える）。
 * 押して何かが起きるのは、見出しのすぐ右の ↑ / ↓（前・次の指示へ。⌘⌥↑ / ↓ と同じ）とその右の開閉の矢印・添付だけ（見出しと文は押しても何もしない）。
 * 添付があれば、送信待ちの行と同じく 1 つ目だけを小さく出す（帯の高さは変えない。押すと大きく表示）。
 * 右クリックで、全文の開閉と、見出し・会話の右クリックと同じ「チャット画面表示」（帯を隠すのはその「指示の帯」。タブの列・見出しの行を隠すと帯がいちばん上になるので、ここからも戻せる）。
 * 読んでいるのが AI からの質問への回答なら、「質問への回答」と添えて、たたんでいる間は答えだけを 1 行に、全文では質問ごとに質問の文と答えを出す。
 * 圧縮前指示・圧縮後指示なら「圧縮前指示」「圧縮後指示」と添える
 */
export function StickyPrompt({
  prompt,
  attachments,
  onPrev,
  onNext,
}: {
  /** 帯に出す指示か質問への回答（指示の一覧の 1 行） */
  prompt: PromptEntry;
  attachments: Attachment[];
  /** 前・次の指示へ移る（ないときは押せない。⌘⌥↑ / ↓ と同じ） */
  onPrev?: () => void;
  onNext?: () => void;
}) {
  // 回答は答えだけを並べた 1 行（たたんでいる間）
  const { answers, compactKind } = prompt;
  const text = answers ? prompt.label : prompt.text;
  const [expanded, setExpanded] = useSetting(storage.settings.stickyPromptExpanded);
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
        <IconButton icon={ArrowUp} label="前の指示へ" title="前の指示へ（⌘⌥↑）" iconSize={14} disabled={!onPrev} onClick={onPrev} />
        <IconButton icon={ArrowDown} label="次の指示へ" title="次の指示へ（⌘⌥↓）" iconSize={14} disabled={!onNext} onClick={onNext} />
        <IconButton
          icon={expanded ? ChevronUp : ChevronDown}
          label={expanded ? "1 行にたたむ" : "指示の全文を表示"}
          title={expanded || canExpand ? undefined : "指示は 1 行に収まっています"}
          aria-expanded={expanded}
          iconSize={14}
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
          {/* タブの列・見出しの行を隠すと帯がチャットのいちばん上になるので、ここからも戻せるようにする（帯を隠すのも「指示の帯」のチェック） */}
          {(expanded || canExpand) && <div className="menu-separator" role="separator" />}
          <ChatDisplayItems />
        </PopupMenu>
      )}
    </div>
  );
}

/** 全文で出す、質問ごとの質問の文と答え（吹き出しの「質問への回答」と同じ並び） */
function AnswerList({ answers }: { answers: NonNullable<PromptEntry["answers"]> }) {
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
