import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import { CloseButton, IconButton } from "../IconButton";

/** 見つけた文の印（CSS の ::highlight(chat-find) / ::highlight(chat-find-current) で色を付ける） */
const HIGHLIGHT = "chat-find";
const CURRENT = "chat-find-current";

/**
 * チャットの中の検索。発言・返答の文から探して印を付け、Enter / ↓ で次、Shift+Enter / ↑ で前へ移る。
 * 閉じたツールのまとまり・思考の中は探さない（見えていない文に移らないように）。
 * 印は CSS Custom Highlight API で付け、DOM は書き換えない（React の描画とぶつからない）。
 * version が変わったら（新しい発言が届いたら）探し直す
 */
export function ChatFind({
  root,
  version,
  onJump,
  onClose,
}: {
  /** 探す範囲（タイムラインの中身） */
  root: RefObject<HTMLElement | null>;
  version: unknown;
  /** 見つけた所へスクロールする前に呼ぶ（一番下への追従をやめる） */
  onJump: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [ranges, setRanges] = useState<Range[]>([]);
  const [index, setIndex] = useState(0);

  // 探し直す（検索語・中身が変わったとき）
  useEffect(() => {
    const found = root.current && query.trim() ? findRanges(root.current, query.trim()) : [];
    setRanges(found);
    setIndex((i) => (i < found.length ? i : 0));
  }, [query, version, root]);

  // 印を付ける（閉じたら外す）
  useEffect(() => {
    const highlights = CSS.highlights;
    if (!highlights) return;
    highlights.set(HIGHLIGHT, new Highlight(...ranges));
    if (ranges[index]) highlights.set(CURRENT, new Highlight(ranges[index]));
    else highlights.delete(CURRENT);
    return () => {
      highlights.delete(HIGHLIGHT);
      highlights.delete(CURRENT);
    };
  }, [ranges, index]);

  const go = (next: number) => {
    if (ranges.length === 0) return;
    const i = (next + ranges.length) % ranges.length;
    setIndex(i);
    onJump();
    ranges[i].startContainer.parentElement?.scrollIntoView({ block: "center" });
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
            go(index + (e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey) ? -1 : 1));
          } else if (e.key === "Escape") {
            // パネルを閉じる Esc より先に、検索を閉じる
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            onClose();
          }
        }}
      />
      <span className="chat-find-count muted small" aria-live="polite">
        {query.trim() ? (ranges.length ? `${index + 1} / ${ranges.length}` : "見つかりません") : ""}
      </span>
      <IconButton icon={ChevronUp} label="前を探す" title="前を探す（Shift+Enter）" size={14} disabled={ranges.length === 0} onClick={() => go(index - 1)} />
      <IconButton icon={ChevronDown} label="次を探す" title="次を探す（Enter）" size={14} disabled={ranges.length === 0} onClick={() => go(index + 1)} />
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
