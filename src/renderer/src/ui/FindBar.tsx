import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/lib/cx";
import { isCancelKey, isComposing } from "@/lib/keys";
import { findInTexts, stepMatch } from "@/lib/textFind";
import { CloseButton, IconButton } from "./IconButton";

/** 印の名前（CSS の ::highlight(pane-find) / ::highlight(pane-find-current)） */
const ALL = "pane-find";
const CURRENT = "pane-find-current";

/** 探すときに入らない要素（入力欄・見えないもの・検索の欄そのもの） */
const SKIP = "input, textarea, script, style, [hidden], .pane-find";

/** 中身が変わってから探し直すまで（読み込み・色付けが続けて届いても 1 回にまとめる） */
const RESEARCH_DELAY_MS = 150;

/** 要素の中の、見えている文字のノード */
function textNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent || !node.nodeValue?.trim() || parent.closest(SKIP) || !parent.checkVisibility()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  return nodes;
}

const clearMarks = () => {
  CSS.highlights?.delete(ALL);
  CSS.highlights?.delete(CURRENT);
};

/**
 * ページの中の文字を探す欄（⌘F）。target の中の見えている文字から探して印を付け（CSS Custom Highlight API。DOM は書き換えない）、
 * host の右上に浮かせる（host は position: relative の要素）。Enter / ↓ で次、Shift+Enter / ↑ で前、Esc で閉じる。
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
  const [count, setCount] = useState(0);
  const [index, setIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // 印の位置（探し直したら作り直す）
  const ranges = useRef<Range[]>([]);
  const indexRef = useRef<number | null>(null);

  /** 探し直す（文字・中身が変わったとき）。合った数を返す */
  const research = (text: string) => {
    const nodes = textNodes(target);
    const matches = findInTexts(
      nodes.map((n) => n.nodeValue ?? ""),
      text,
    );
    ranges.current = matches.map((m) => {
      const range = document.createRange();
      range.setStart(nodes[m.node], m.start);
      range.setEnd(nodes[m.node], m.end);
      return range;
    });
    if (typeof Highlight !== "undefined" && CSS.highlights) {
      if (ranges.current.length > 0) CSS.highlights.set(ALL, new Highlight(...ranges.current));
      else clearMarks();
    }
    setCount(ranges.current.length);
    return ranges.current.length;
  };

  /** その位置に、いまの印を付ける（scroll ならそこまでスクロールする） */
  const show = (i: number | null, scroll = true) => {
    setIndex(i);
    indexRef.current = i;
    CSS.highlights?.delete(CURRENT);
    const range = i === null ? undefined : ranges.current[i];
    if (!range) return;
    if (typeof Highlight !== "undefined") CSS.highlights?.set(CURRENT, new Highlight(range));
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
  }, [query, target]);

  // 中身が変わったら探し直す（いまの位置は、数の中にあればそのまま。スクロールはしない）
  useEffect(() => {
    if (!query) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const n = research(query);
        const i = indexRef.current;
        show(i !== null && i < n ? i : n > 0 ? 0 : null, false);
      }, RESEARCH_DELAY_MS);
    });
    observer.observe(target, { childList: true, subtree: true, characterData: true });
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, target]);

  // 閉じたら・消えたら印を外す
  useEffect(() => clearMarks, []);

  const go = (step: 1 | -1) => {
    // 中身が変わっていることがある（実行中のサブエージェント・取り直した差分）ので、探し直してから移る
    const n = research(query);
    show(stepMatch(index !== null && index < n ? index : null, n, step));
  };

  if (!host.isConnected) return null;
  return createPortal(
    <div className={cx("pane-find", className)} role="search">
      <Search size={13} className="muted" aria-hidden />
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (isComposing(e)) return;
          if (isCancelKey(e)) {
            // パネル・右の欄を閉じる Esc に渡さない
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            onClose();
          } else if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            go(e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey) ? -1 : 1);
          }
        }}
      />
      <span className="pane-find-count">{query ? (count === 0 ? "0 件" : `${(index ?? 0) + 1}/${count}`) : ""}</span>
      <IconButton type="button" icon={ChevronUp} size={13} label="前へ" keys="⇧Enter" disabled={count === 0} onClick={() => go(-1)} />
      <IconButton type="button" icon={ChevronDown} size={13} label="次へ" keys="Enter" disabled={count === 0} onClick={() => go(1)} />
      <CloseButton type="button" size={13} label="検索を閉じる" keys="Esc" onClick={onClose} />
    </div>,
    host,
  );
}
