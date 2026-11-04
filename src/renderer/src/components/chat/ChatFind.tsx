import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { CloseButton, IconButton } from "../IconButton";
import { findMatches } from "./chatFindMatches";
import type { TimelineItem } from "./timelineItems";

/** 見つけた文の印（CSS の ::highlight(chat-find) / ::highlight(chat-find-current) で色を付ける） */
const HIGHLIGHT = "chat-find";
const CURRENT = "chat-find-current";

/**
 * チャットの中の検索。自分の発言と AI の返答から探して印を付け、↑ / Shift+Enter で前（古い方）、↓ / Enter で次へ移る。
 * 探すのは記録から（findMatches）で、流れ（最近の項目だけを描く窓）をすべて描かない。移るときに、その発言を描くよう窓を動かす（onGoto）。
 * 初めて移るときは、いちばん新しい一致へ。印は描いている範囲の文に CSS Custom Highlight API で付け、DOM は書き換えない（React の描画とぶつからない）。
 * 閉じたツールのまとまり・思考の中は探さない（見えていない文に印を付けないように）
 */
export function ChatFind({
  root,
  items,
  version,
  onGoto,
  onClose,
}: {
  /** 印を付ける範囲（タイムラインの中身） */
  root: RefObject<HTMLElement | null>;
  /** 流れ全体（描いていない分も含めて探す） */
  items: TimelineItem[];
  /** 描いている項目（変わったら印を付け直す） */
  version: unknown;
  /** その発言へ移る（一番下への追従をやめ、窓の外なら窓を動かす） */
  onGoto: (eventId: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  // 長いチャットでも打つのが遅れないよう、探すのは入力に遅れて
  const needle = useDeferredValue(query.trim());
  const matches = useMemo(() => findMatches(items, needle), [items, needle]);
  // いま選んでいる一致（null = まだ移っていない）
  const [index, setIndex] = useState<number | null>(null);
  useEffect(() => setIndex(null), [needle]);
  const current = index !== null ? matches[index] : undefined;
  // 移ったら、その発言を描いてからスクロールする
  const scrollPending = useRef(false);

  // 描いている範囲の一致すべてに印を付ける（閉じたら外す）
  useEffect(() => {
    const highlights = CSS.highlights;
    if (!highlights) return;
    if (root.current && needle) highlights.set(HIGHLIGHT, new Highlight(...findRanges(root.current, needle)));
    else highlights.delete(HIGHLIGHT);
    return () => {
      highlights.delete(HIGHLIGHT);
    };
  }, [needle, version, root]);

  // いま選んでいる一致に印を付け、移ったばかりならそこまでスクロールする（その発言の中の nth 番目。描いた文と記録がずれたら最初）
  useEffect(() => {
    const highlights = CSS.highlights;
    const el = current && root.current?.querySelector<HTMLElement>(`#ev-${current.eventId}`);
    if (!el) {
      highlights?.delete(CURRENT);
      return;
    }
    const ranges = findRanges(el, needle);
    const range = ranges[current.nth] ?? ranges[0];
    if (range) highlights?.set(CURRENT, new Highlight(range));
    else highlights?.delete(CURRENT);
    if (scrollPending.current) {
      scrollPending.current = false;
      (range?.startContainer.parentElement ?? el).scrollIntoView({ block: "center" });
    }
    return () => {
      highlights?.delete(CURRENT);
    };
  }, [current, needle, version, root]);

  const go = (step: 1 | -1) => {
    if (matches.length === 0) return;
    const i = index === null ? matches.length - 1 : (index + step + matches.length) % matches.length;
    setIndex(i);
    scrollPending.current = true;
    onGoto(matches[i].eventId);
  };

  return (
    <div className="chat-find" role="search">
      <Search size={13} className="muted" aria-hidden />
      <input
        type="text"
        value={query}
        autoFocus
        placeholder="このチャットの中を検索"
        aria-label="このチャットの中を検索"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            go(e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey) ? -1 : 1);
          } else if (e.key === "Escape") {
            // パネルを閉じる Esc より先に、検索を閉じる
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            onClose();
          }
        }}
      />
      <span className="chat-find-count muted small" aria-live="polite">
        {needle ? (matches.length ? (index === null ? `${matches.length} 件` : `${index + 1} / ${matches.length}`) : "見つかりません") : ""}
      </span>
      <IconButton icon={ChevronUp} label="前を探す" title="前を探す（Shift+Enter）" size={14} disabled={matches.length === 0} onClick={() => go(-1)} />
      <IconButton icon={ChevronDown} label="次を探す" title="次を探す（Enter）" size={14} disabled={matches.length === 0} onClick={() => go(1)} />
      <CloseButton label="検索を閉じる" title="閉じる（Esc）" size={14} onClick={onClose} />
    </div>
  );
}

/** root の中の、見えている文から query を探す（大文字・小文字を区別しない） */
function findRanges(root: HTMLElement, query: string): Range[] {
  const needle = query.toLowerCase();
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      // 閉じたツールのまとまり・思考の中身（summary 以外）と、ボタンの文は探さない
      if (!parent || parent.closest("button, .message-meta")) return NodeFilter.FILTER_REJECT;
      const details = parent.closest("details");
      if (details && !details.open && !parent.closest("summary")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? "").toLowerCase();
    for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + needle.length)) {
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + needle.length);
      ranges.push(range);
    }
  }
  return ranges;
}
