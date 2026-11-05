import { CaseSensitive, ChevronDown, ChevronUp, Search } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/lib/cx";
import { consumeKey, hasModifiers, isCancelKey, isComposing, isKey } from "@/lib/keys";
import { useChatPane } from "@/features/chat/pane/chatPaneContext";
import { useChatHotkey } from "@/features/chat/pane/chatHotkeys";
import { useSetting } from "@/hooks/useSetting";
import { CHAT_FIND_CASE } from "@/lib/storageKeys";
import { CloseButton, IconButton } from "@/ui/IconButton";
import { findMatches, matchOffsets } from "./chatFindMatches";
import type { TimelineItem } from "@/features/chat/timeline/timelineItems";

/** 見つけた文の印（CSS の ::highlight(chat-find) / ::highlight(chat-find-current) で色を付ける） */
const HIGHLIGHT = "chat-find";
const CURRENT = "chat-find-current";

/**
 * チャットの中の検索。チャットの見出しの行にいつも置き、⌘F でピントが入る（ピントがこのチャットの中にあるとき、
 * またはどこにもピントがなく最後に押したのがこのチャットのとき。アプリ全体の ⌘F（ボードのチャット名の検索欄）より先に受け取る）。Esc で文を消してチャット欄に戻る。自分の発言と AI の返答から探して印を付け、↑ / Shift+Enter で前（古い方）、↓ / Enter で次へ移る。
 * 探すのは記録から（findMatches）で、流れ（最近の項目だけを描く窓）をすべて描かない。移るときに、その発言を描くよう窓を動かす（onGoto）。
 * 初めて移るときは、いちばん新しい一致へ。印は描いている範囲の文に CSS Custom Highlight API で付け、DOM は書き換えない（React の描画とぶつからない）。
 * 閉じたツールのまとまり・思考の中は探さない（見えていない文に印を付けないように）。
 * 打った文は前後の空白も削らずに探し（半角・全角の空白も探せる）、右の「Aa」（⌥⌘C）で大文字・小文字を区別するかを切り替える（VS Code と同じ。覚えておく）
 */
export function ChatFind({
  items,
  version,
  floating = false,
}: {
  /**
   * 見出しに出さず、チャットの右上に浮かせる（見出しの行・項目を隠したとき）。⌘F でピントが入っている・文が残っている間だけ出し、
   * ふだんはピントを受けられるよう、描いたまま見えなくする
   */
  floating?: boolean;
  /** 流れ全体（描いていない分も含めて探す） */
  items: TimelineItem[];
  /** 描いている項目（変わったら印を付け直す） */
  version: unknown;
}) {
  // 印を付ける範囲（チャットの画面）・移るとき（その発言を描くよう窓を動かす）・やめたあと（チャット欄にピントを戻す）
  const { root, reveal, focusComposer } = useChatPane();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useSetting(CHAT_FIND_CASE);
  // 長いチャットでも打つのが遅れないよう、探すのは入力に遅れて（空白も探す文字なので削らない）
  const needle = useDeferredValue(query);
  const matches = useMemo(() => findMatches(items, needle, caseSensitive), [items, needle, caseSensitive]);
  // いま選んでいる一致（null = まだ移っていない）
  const [index, setIndex] = useState<number | null>(null);
  useEffect(() => setIndex(null), [needle, caseSensitive]);
  const current = index !== null ? matches[index] : undefined;
  // 移ったら、その発言を描いてからスクロールする
  const scrollPending = useRef(false);

  // 描いている範囲の一致すべてに印を付ける（閉じたら外す）
  useEffect(() => {
    const highlights = CSS.highlights;
    if (!highlights) return;
    if (root.current && needle) highlights.set(HIGHLIGHT, new Highlight(...findRanges(root.current, needle, caseSensitive)));
    else highlights.delete(HIGHLIGHT);
    return () => {
      highlights.delete(HIGHLIGHT);
    };
  }, [needle, caseSensitive, version, root]);

  // いま選んでいる一致に印を付け、移ったばかりならそこまでスクロールする（その発言の中の nth 番目。描いた文と記録がずれたら最初）
  useEffect(() => {
    const highlights = CSS.highlights;
    const el = current && root.current?.querySelector<HTMLElement>(`#ev-${current.eventId}`);
    if (!el) {
      highlights?.delete(CURRENT);
      return;
    }
    const ranges = findRanges(el, needle, caseSensitive);
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
  }, [current, needle, caseSensitive, version, root]);

  const go = (step: 1 | -1) => {
    if (matches.length === 0) return;
    const i = index === null ? matches.length - 1 : (index + step + matches.length) % matches.length;
    setIndex(i);
    scrollPending.current = true;
    reveal(matches[i].eventId);
  };

  // ⌘F: 見出しの行の検索欄にピントを移し、前に打った文を選んで打ち直せるようにする（アプリ全体の ⌘F より先に、捕捉で受け取る）
  useChatHotkey(
    root,
    (e) => isKey(e, "f", { meta: true }) || isKey(e, "f", { ctrl: true }),
    (e) => {
      const input = inputRef.current;
      if (!input) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      input.focus();
      input.select();
    },
    { capture: true, pressed: true },
  );

  return (
    // 欄のどこを押しても入力欄にピント（虫眼鏡も。狭い見出しでは虫眼鏡だけになり、押す・⌘F で広がる）
    <div className={cx("chat-find", query && "active", floating && "floating")} role="search" onPointerDown={(e) => e.target === e.currentTarget && (e.preventDefault(), inputRef.current?.focus())}>
      <Search size={13} className="muted" aria-hidden onPointerDown={(e) => (e.preventDefault(), inputRef.current?.focus())} />
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder="このチャットを検索"
        title="このチャットの中を検索（⌘F）"
        aria-label="このチャットの中を検索"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (isComposing(e)) return;
          // ⌥⌘C: 大文字・小文字を区別するかを切り替える（⌥ を押すと文字が変わるので、キーの位置で見る）
          if (e.code === "KeyC" && hasModifiers(e, { meta: true, alt: true })) {
            e.preventDefault();
            setCaseSensitive(!caseSensitive);
            return;
          }
          if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            go(e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey) ? -1 : 1);
          } else if (isCancelKey(e)) {
            // パネルを閉じる Esc より先に、検索をやめる（文を消して印を外し、チャット欄にピントを戻す）
            consumeKey(e);
            e.nativeEvent.stopImmediatePropagation();
            setQuery("");
            focusComposer();
          }
        }}
      />
      {/* 件数・前後・大文字小文字は、文を入れたときだけ出す（ふだんは見出しの行をすっきりさせる） */}
      {query && (
        <>
      <IconButton
        icon={CaseSensitive}
        label="大文字と小文字を区別する"
        title="大文字と小文字を区別する（⌥⌘C）"
        size={16}
        className={cx("find-option", caseSensitive && "on")}
        aria-pressed={caseSensitive}
        onClick={() => setCaseSensitive(!caseSensitive)}
      />
      <span className="chat-find-count muted small" aria-live="polite">
        {needle ? (matches.length ? (index === null ? `${matches.length} 件` : `${index + 1} / ${matches.length}`) : "見つかりません") : ""}
      </span>
      <IconButton icon={ChevronUp} label="前を探す" title="前を探す（Shift+Enter）" size={14} disabled={matches.length === 0} onClick={() => go(-1)} />
      <IconButton icon={ChevronDown} label="次を探す" title="次を探す（Enter）" size={14} disabled={matches.length === 0} onClick={() => go(1)} />
      <CloseButton label="検索の文を消す" title="消す（Esc）" size={14} onClick={() => (setQuery(""), inputRef.current?.focus())} />
        </>
      )}
    </div>
  );
}

/** root の中の、見えている文から query を探す（記録から探す matchOffsets と同じ照らし合わせ） */
function findRanges(root: HTMLElement, query: string, caseSensitive: boolean): Range[] {
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
    for (const at of matchOffsets(node.textContent ?? "", query, caseSensitive)) {
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + query.length);
      ranges.push(range);
    }
  }
  return ranges;
}
