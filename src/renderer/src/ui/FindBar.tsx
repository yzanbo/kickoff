import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/lib/cx";
import { useFindOptions } from "@/hooks/useFindOptions";
import { findInTexts, findPattern, stepMatch } from "@/lib/textFind";
import { createFindMarks, findTextNodes, framesIn } from "./findMarks";
import { FindField, findCountText } from "./FindField";

/** 中身が変わってから探し直すまで（読み込み・色付けが続けて届いても 1 回にまとめる） */
const RESEARCH_DELAY_MS = 150;

/**
 * ページの中の文字を探す欄（⌘F）。target の中の見えている文字（中の同じオリジンの iframe の中も。HTML のメモのページ）から探して印を付け（CSS Custom Highlight API。DOM は書き換えない。findMarks.ts）、
 * host の右上に浮かせる（host は position: relative の要素）。Enter / ↓ で次、Shift+Enter / ↑ で前、Esc で閉じる。
 * 探し方（大文字・小文字の区別・単語単位・正規表現。⌥⌘C / ⌥⌘W / ⌥⌘R）は、ほかの検索の欄と同じ値（useFindOptions）。
 * target の中身が変わったら（ファイルを選び直した・読み込みや色付けが届いた・差分を取り直した）、探し直す。
 * focusSignal が変わるたびに（もう一度 ⌘F を押したとき）、欄にピントを置いて文を選ぶ。
 * 使うのは、ページの ⌘F（usePageFind）とチャットの画面の右の欄の ⌘F（AgentPanelFind）
 */
export function FindBar({
  target,
  host,
  focusSignal,
  onClose,
  placeholder = "このページを検索",
  className,
}: {
  target: HTMLElement;
  host: HTMLElement;
  focusSignal: number;
  onClose: () => void;
  placeholder?: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const { options, toggle } = useFindOptions();
  const invalid = (() => {
    const pattern = findPattern(query, options);
    return pattern !== null && "error" in pattern;
  })();
  const [count, setCount] = useState(0);
  const [index, setIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // 印の位置（探し直したら作り直す）
  const ranges = useRef<Range[]>([]);
  const indexRef = useRef<number | null>(null);
  // 印（iframe の中は、その文書に付ける）
  const marks = useRef(createFindMarks()).current;

  /** 探し直す（文字・中身が変わったとき）。合った数を返す */
  const research = (text: string) => {
    const nodes = findTextNodes(target);
    const matches = findInTexts(
      nodes.map((n) => n.nodeValue ?? ""),
      text,
      options,
    );
    ranges.current = matches.map((m) => {
      const range = nodes[m.node].ownerDocument.createRange();
      range.setStart(nodes[m.node], m.start);
      range.setEnd(nodes[m.node], m.end);
      return range;
    });
    marks.all(ranges.current);
    setCount(ranges.current.length);
    return ranges.current.length;
  };

  /** その位置に、いまの印を付ける（scroll ならそこまでスクロールする） */
  const show = (i: number | null, scroll = true) => {
    setIndex(i);
    indexRef.current = i;
    const range = i === null ? undefined : ranges.current[i];
    marks.current(range);
    if (!range) return;
    if (scroll) range.startContainer.parentElement?.scrollIntoView({ block: "center", inline: "nearest" });
  };

  // 開いたとき・もう一度 ⌘F を押したとき: 欄にピントを置いて、前に打った文を選ぶ
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [focusSignal]);

  // 文字を変えたら探し直して、最初の一致へ
  useEffect(() => {
    const n = research(query);
    show(n > 0 ? 0 : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, target, options]);

  // 中身が変わったら探し直す（いまの位置は、数の中にあればそのまま。スクロールはしない）
  useEffect(() => {
    if (!query) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const researchSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const n = research(query);
        const i = indexRef.current;
        show(i !== null && i < n ? i : n > 0 ? 0 : null, false);
      }, RESEARCH_DELAY_MS);
    };
    const observer = new MutationObserver(researchSoon);
    observer.observe(target, { childList: true, subtree: true, characterData: true });
    // 中の iframe は、読み込み直すと文書ごと入れ替わる（中の変化は MutationObserver に届かない）
    const frames = framesIn(target);
    for (const f of frames) f.addEventListener("load", researchSoon);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      for (const f of frames) f.removeEventListener("load", researchSoon);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, target, options]);

  // 閉じたら・消えたら印を外す
  useEffect(() => marks.clear, [marks]);

  const go = (step: 1 | -1) => {
    // 中身が変わっていることがある（実行中のサブエージェント・取り直した差分）ので、探し直してから移る
    const n = research(query);
    show(stepMatch(index !== null && index < n ? index : null, n, step));
  };

  if (!host.isConnected) return null;
  return createPortal(
    <FindField
      inputRef={inputRef}
      value={query}
      onChange={setQuery}
      placeholder={placeholder}
      invalid={invalid}
      options={options}
      onToggleOption={toggle}
      count={findCountText({ invalid, query, total: count, current: index })}
      canStep={count > 0}
      onStep={go}
      onClose={onClose}
      className={cx("pane-find", className)}
    />,
    host,
  );
}
