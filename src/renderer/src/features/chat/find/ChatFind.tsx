import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/lib/cx";
import { consumeKey, isKey } from "@/lib/keys";
import { findPattern, spansIn, type FindPattern } from "@/lib/textFind";
import { useChatPane } from "@/features/chat/pane/chatPaneContext";
import { useChatHotkey } from "@/features/chat/pane/chatHotkeys";
import { useFindOptions } from "@/hooks/useFindOptions";
import { FindField, findCountText } from "@/ui/FindField";
import { findMatches } from "./chatFindMatches";
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
 * 打った文は前後の空白も削らずに探し（半角・全角の空白も探せる）、右の「Aa」「ab」「.*」（⌥⌘C / ⌥⌘W / ⌥⌘R）で大文字・小文字の区別・単語単位・正規表現を切り替える
 * （VS Code と同じ。ほかの検索の欄と同じ値を覚えておく useFindOptions）
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
  const { options, toggle } = useFindOptions();
  // 長いチャットでも打つのが遅れないよう、探すのは入力に遅れて（空白も探す文字なので削らない）
  const needle = useDeferredValue(query);
  // 探す形（正規表現の誤りなら error。件数のところに出す）
  const pattern = useMemo(() => findPattern(needle, options), [needle, options]);
  const invalid = pattern !== null && "error" in pattern;
  const matches = useMemo(() => findMatches(items, pattern), [items, pattern]);
  // いま選んでいる一致（null = まだ移っていない）
  const [index, setIndex] = useState<number | null>(null);
  useEffect(() => setIndex(null), [pattern]);
  const current = index !== null ? matches[index] : undefined;
  // 移ったら、その発言を描いてからスクロールする
  const scrollPending = useRef(false);

  // 描いている範囲の一致すべてに印を付ける（閉じたら外す）
  useEffect(() => {
    const highlights = CSS.highlights;
    if (!highlights) return;
    if (root.current && pattern) highlights.set(HIGHLIGHT, new Highlight(...findRanges(root.current, pattern)));
    else highlights.delete(HIGHLIGHT);
    return () => {
      highlights.delete(HIGHLIGHT);
    };
  }, [pattern, version, root]);

  // いま選んでいる一致に印を付け、移ったばかりならそこまでスクロールする（その発言の中の nth 番目。描いた文と記録がずれたら最初）
  useEffect(() => {
    const highlights = CSS.highlights;
    const el = current && root.current?.querySelector<HTMLElement>(`#ev-${current.eventId}`);
    if (!el) {
      highlights?.delete(CURRENT);
      return;
    }
    const ranges = findRanges(el, pattern);
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
  }, [current, pattern, version, root]);

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
    // 欄のどこを押しても入力欄にピント（虫眼鏡も。狭い見出しでは虫眼鏡だけになり、押す・⌘F で広がる）。見た目と操作はほかの検索の欄と同じ FindField
    <FindField
      inputRef={inputRef}
      value={query}
      onChange={setQuery}
      placeholder="このチャットを検索"
      inputProps={{ title: "このチャットの中を検索（⌘F）" }}
      invalid={invalid}
      options={options}
      onToggleOption={toggle}
      count={findCountText({ invalid, query: needle, total: matches.length, current: index })}
      canStep={matches.length > 0}
      onStep={go}
      closeLabel="検索の文を消す"
      // 閉じる・Esc: 文を消して印を外す（見出しの欄は残る）。Esc はチャット欄にピントを戻し、パネルを閉じる Esc より先に受け取る
      onClose={() => (setQuery(""), inputRef.current?.focus())}
      onEscape={(e) => {
        consumeKey(e);
        e.nativeEvent.stopImmediatePropagation();
        setQuery("");
        focusComposer();
      }}
      className={cx("chat-find", query && "active", floating && "floating")}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button, input")) return;
        e.preventDefault();
        inputRef.current?.focus();
      }}
    />
  );
}

/** root の中の、見えている文から pattern に合う所を探す（記録から探す findMatches と同じ照らし合わせ） */
function findRanges(root: HTMLElement, pattern: FindPattern): Range[] {
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
    for (const span of spansIn(node.textContent ?? "", pattern)) {
      const range = document.createRange();
      range.setStart(node, span.start);
      range.setEnd(node, span.end);
      ranges.push(range);
    }
  }
  return ranges;
}
