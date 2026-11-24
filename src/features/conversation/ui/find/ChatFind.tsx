import "./ChatFind.css";
import { useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { consumeKey, isKey } from "@/foundation/ui/lib/keys";
import { findPattern, spansIn, type FindPattern } from "@/foundation/ui/lib/textFind";
import type { ChatEvent } from "@shared/chat/chatEvent";
import { useChatScreen, useTimelineNav } from "@/features/chat/ui";
import { focusComposer } from "@/features/composer/ui";
import { useCell } from "@/foundation/ui/store";
import { chatTail } from "@/features/chat/ui";
import { useChatHotkey } from "@/features/conversation/ui/chatHotkeys";
import { useFindOptions } from "@/foundation/ui/hooks/useFindOptions";
import { FindField, findCountText } from "@/foundation/ui/kit/FindField";
import { createFindMarks, findTextNodes } from "@/foundation/ui/kit/findMarks";
import { findMatches } from "./chatFindMatches";

/**
 * 見つけた文の印の名前（チャットの画面ごと。CSS.highlights は文書に 1 つなので、同じウィンドウのほかのチャットの検索の印を消さない・上書きしない）。
 * 色は findMarks が名前ごとに置く CSS（::highlight(chat-find-<ID>) / ::highlight(chat-find-current-<ID>)）
 */
const marksOf = (chatId: number) => createFindMarks({ names: { all: `chat-find-${chatId}`, current: `chat-find-current-${chatId}` } });

/**
 * チャットの中の検索。チャットの見出しの行にいつも置き、⌘F でピントが入る（ピントがこのチャットの中にあるとき、
 * またはどこにもピントがなく最後に押したのがこのチャットのとき。アプリ全体の ⌘F（ボードのチャット名の検索欄）より先に受け取る）。Esc で文を消してチャット欄に戻る。自分の発言と AI の返答から探して印を付け、↑ / Shift+Enter で前（古い方）、↓ / Enter で次へ移る。
 * 探すのは記録から（findMatches）で、流れ（最近の項目だけを描く窓）をすべて描かない。末尾より前の本文は、文を打ち始めたときにコアから読み
 * （searchTexts。文を消したら捨てる。正規表現はコアで流さない）、移るときは読んでいなければその前後を読んでから、その発言を描くよう窓を動かす（reveal）。
 * 初めて移るときは、いちばん新しい一致へ。印は描いている範囲の文に CSS Custom Highlight API で付け、DOM は書き換えない（React の描画とぶつからない）。
 * 閉じたツールのまとまり・思考の中は探さない（見えていない文に印を付けないように）。
 * 打った文は前後の空白も削らずに探し（半角・全角の空白も探せる）、右の「Aa」「ab」「.*」（⌥⌘C / ⌥⌘W / ⌥⌘R）で大文字・小文字の区別・単語単位・正規表現を切り替える
 * （VS Code と同じ。ほかの検索の欄と同じ値を覚えておく useFindOptions）
 */
export function ChatFind({
  floating = false,
}: {
  /**
   * 見出しに出さず、チャットの右上に浮かせる（見出しの行・項目を隠したとき）。⌘F でピントが入っている・文が残っている間だけ出し、
   * ふだんはピントを受けられるよう、描いたまま見えなくする
   */
  floating?: boolean;
}) {
  // 印を付ける範囲（チャットの画面）・移るとき（その発言を描くよう窓を動かす）・やめたあと（チャット欄にピントを戻す）
  const { chatId, root } = useChatScreen();
  const { reveal, searchTexts, drawn, jumping: jumpingCell } = useTimelineNav();
  // 記録の末尾（その前の本文は searchTexts で読む）
  const tail = chatTail.useFor(chatId);
  // 流れの窓が描く行を変えたら印を付け直す（見出しを通さずに直接購読する。スクロールで描く行が変わっても見出しは描き直さない）
  const version = useSyncExternalStore(drawn.subscribe, drawn.get);
  // 遠い一致へ移るために読んでいる（150ms を超えたら件数のところに出す）
  const jumping = useCell(jumpingCell);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const { options, toggle } = useFindOptions();
  // 長いチャットでも打つのが遅れないよう、探すのは入力に遅れて（空白も探す文字なので削らない）
  const needle = useDeferredValue(query);
  // 探す形（正規表現の誤りなら error。件数のところに出す）
  // 残す: 描く中で前の形と比べて選んだ一致を外す（同じ形なら同じ物でないと、描くたびに外して描き直し続ける）
  const pattern = useMemo(() => findPattern(needle, options), [needle, options]);
  const invalid = pattern !== null && "error" in pattern;
  // 末尾より前の本文（文を打ち始めたら読み、文を消したら捨てる）
  const active = query !== "";
  const [earlier, setEarlier] = useState<ChatEvent[] | null>(null);
  const [loadingTexts, setLoadingTexts] = useState(false);
  // 文を消したら捨てる（描いている間に決める。隠したタブを表に戻して effect が流れ直しても、読んだ本文を捨てて読み直さない）
  if (!active && earlier !== null) setEarlier(null);
  useEffect(() => {
    if (!active || earlier !== null) return;
    let alive = true;
    setLoadingTexts(true);
    void searchTexts()
      .then(
        (events) => alive && setEarlier(events),
        () => alive && setEarlier([]),
      )
      .finally(() => {
        if (alive) setLoadingTexts(false);
      });
    return () => {
      alive = false;
      setLoadingTexts(false);
    };
  }, [active, earlier, searchTexts]);
  const first = tail[0]?.id ?? Number.MAX_SAFE_INTEGER;
  const searchable = earlier?.length ? [...earlier.filter((e) => e.id < first), ...tail] : tail;
  const matches = findMatches(searchable, pattern);
  // いま選んでいる一致（null = まだ移っていない）
  const [index, setIndex] = useState<number | null>(null);
  // 探す形が変わったときだけ外す（前の形と比べて描いている間に決める。隠したタブを表に戻しても、選んでいた一致を残す）
  const [indexFor, setIndexFor] = useState(pattern);
  if (indexFor !== pattern) {
    setIndexFor(pattern);
    setIndex(null);
  }
  const current = index !== null ? matches[index] : undefined;
  // 描いている範囲の一致すべてに印を付ける（閉じたら外す）
  useEffect(() => {
    if (!root.current || !pattern) return;
    const marks = marksOf(chatId);
    marks.all(findRanges(root.current, pattern));
    return () => marks.all([]);
  }, [pattern, version, root, chatId]);

  // いま選んでいる一致に印を付ける（その発言の中の nth 番目。描いた文と記録がずれたら最初。描かれたら付け直す）
  useEffect(() => {
    const el = current && root.current?.querySelector<HTMLElement>(`#ev-${current.eventId}`);
    if (!el) return;
    const ranges = findRanges(el, pattern);
    const marks = marksOf(chatId);
    marks.current(ranges[current.nth] ?? ranges[0]);
    return () => marks.current(undefined);
  }, [current, pattern, version, root, chatId]);

  const go = (step: 1 | -1) => {
    if (matches.length === 0) return;
    const i = index === null ? matches.length - 1 : (index + step + matches.length) % matches.length;
    setIndex(i);
    // 描いて測り終えてから、その一致へスクロールする（読んでいなければ読んでから）
    const target = matches[i];
    void reveal(target.eventId).then(() => {
      const el = root.current?.querySelector<HTMLElement>(`#ev-${target.eventId}`);
      if (!el || !pattern) return;
      const ranges = findRanges(el, pattern);
      ((ranges[target.nth] ?? ranges[0])?.startContainer.parentElement ?? el).scrollIntoView({ block: "center" });
    });
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
      count={loadingTexts ? "読み込み中…" : jumping !== null ? "移動中…" : findCountText({ invalid, query: needle, total: matches.length, current: index })}
      canStep={matches.length > 0}
      onStep={go}
      closeLabel="検索の文を消す"
      // 閉じる・Esc: 文を消して印を外す（見出しの欄は残る）。Esc はチャット欄にピントを戻し、パネルを閉じる Esc より先に受け取る
      onClose={() => (setQuery(""), inputRef.current?.focus())}
      onEscape={(e) => {
        consumeKey(e);
        e.nativeEvent.stopImmediatePropagation();
        setQuery("");
        focusComposer(chatId);
      }}
      className={cx("chat-find", query && "active", floating && "detached")}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button, input")) return;
        e.preventDefault();
        inputRef.current?.focus();
      }}
    />
  );
}

/** 探さない所: ボタンの文・発言の下の行・閉じた開閉（ツールのまとまり・思考）の summary の外 */
const SKIP = "button, .message-meta, details:not([open]) > :not(summary)";

/** root の中の、見えている文から pattern に合う所を探す（記録から探す findMatches と同じ照らし合わせ。空白も探す文字なので空白だけのノードも見る） */
function findRanges(root: HTMLElement, pattern: FindPattern): Range[] {
  return findTextNodes(root, { skip: SKIP, blank: true }).flatMap((node) =>
    spansIn(node.nodeValue ?? "", pattern).map((span) => {
      const range = document.createRange();
      range.setStart(node, span.start);
      range.setEnd(node, span.end);
      return range;
    }),
  );
}
