import { CornerDownLeft, History, MessageCircleQuestion } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/lib/cx";
import { isKey } from "@/lib/keys";
import { useListNavigation } from "@/hooks/useListNavigation";
import { useChatPane } from "@/features/chat/pane/chatPaneContext";
import { useChatHotkey } from "@/features/chat/pane/chatHotkeys";
import { formatMessageTime } from "@/lib/time";
import { IconButton } from "@/ui/IconButton";
import { usePopover } from "@/ui/Popover";
import { ComposerChip } from "@/features/chat/composer/ComposerChip";
import { SearchField } from "@/ui/SearchField";
import type { PromptEntry } from "./promptHistory";
import { COMPACT_PROMPT_KINDS } from "@/features/snippet/compactPromptKinds";
import { CompactPromptMark } from "@/features/snippet/CompactPromptMark";

/**
 * チャット欄の上の「指示の履歴 12」（ToDo・サブエージェントと同じピルの列）。押すと、このチャットで自分が送った指示の一覧を上に開く。
 * 呼び方は、入力欄の「続けて指示する」・「送信待ちの指示」にそろえる。
 * 行を押すとその指示へ移って強調し、行の右のボタンで同じ文を入力欄に入れる（もう一度送る・少し直して送る）。
 * 一覧は会話の順（下ほど新しい）で、開いたらいちばん下（入力欄に近い新しい指示）を見せる。圧縮の前後に送った圧縮前指示・圧縮後指示は、文の前に「圧縮前指示」「圧縮後指示」の札を付ける。
 * AI からの質問への回答も同じ並びに入れ（上に貼り付ける指示の帯と同じく）、番号の代わりに「質問への回答」の札と答えを出す（入力欄には入れない。絞り込みは問いの文でも当たる）。
 * 上の欄で絞り込め、↑↓ で選んで Enter で入力欄に入れる・⌘Enter でその指示へ移る。
 * チャットにピントがあるときの ⌃R でも開く（シェルの履歴の検索と同じ。開いている間の ⌃R は 1 つ前の一致へ）
 */
export function PromptsChip({ prompts }: { prompts: PromptEntry[] }) {
  const pane = useChatPane();
  const popover = usePopover();
  const { open, setOpen } = popover;
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  // 行に出す番号（会話の中で何番目の指示か。質問への回答は数えない。絞り込んでも変えない）
  const numbers = useMemo(() => new Map(prompts.filter((p) => !p.answers).map((p, i) => [p.id, i + 1])), [prompts]);
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    // 質問への回答は、答えだけでなく問いの文でも当てる
    const searchText = (p: PromptEntry) => (p.answers ? [p.label, ...p.answers.map((a) => a.question)].join("\n") : p.label).toLowerCase();
    return q ? prompts.filter((p) => searchText(p).includes(q)) : prompts;
  }, [prompts, query]);
  const close = () => {
    // 絞り込みの欄にピントがあれば、チャット欄に戻す（欄が消えてピントが外れると、次の Esc でパネルが閉じる）
    if (ref.current?.contains(document.activeElement)) pane.focusComposer();
    setOpen(false);
    setQuery("");
  };
  // 行の右のボタン・Enter: 同じ文を入力欄に入れる（もう一度送る・少し直して送る）。質問への回答は入れずに、その回答へ移る
  const reuse = (p: PromptEntry | undefined) => {
    if (p?.answers) return jump(p);
    if (!p?.text) return;
    close();
    pane.fillComposer(p.text);
  };
  // 行・⌘Enter: その指示へ移って強調する
  const jump = (p: PromptEntry | undefined) => {
    if (!p) return;
    close();
    pane.jumpTo(p.id);
  };
  const nav = useListNavigation(items, reuse);
  // 開いた・絞り込んだら、いちばん新しい（下の）指示を選ぶ
  useLayoutEffect(() => {
    if (open) nav.setIndex(items.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items]);
  // 選んでいる行を見せる（開いたときは、いちばん下）
  useLayoutEffect(() => {
    ref.current?.querySelector(".prompt-row.active")?.scrollIntoView({ block: "nearest" });
  }, [open, nav.index]);

  // ⌃R（このチャットにピントがあるとき）: 開いて絞り込みの欄にピントを置く（開いていれば 1 つ前の一致へ）
  useChatHotkey(
    pane.root,
    (e) => isKey(e, "r", { ctrl: true }),
    (e) => {
      e.preventDefault();
      if (!open) setOpen(true);
      else nav.setIndex((i) => Math.max(i - 1, 0));
    },
  );

  if (prompts.length === 0) return null;
  return (
    <ComposerChip
      ref={ref}
      popover={popover}
      chip={
        <>
          <History size={14} className="chip-icon" aria-hidden />
          指示の履歴 {prompts.length}
        </>
      }
      title="このチャットで送った指示の履歴（⌃R。行を押すとその指示へ移り、↵ で入力欄に入れる）"
      label="指示の履歴"
      className="prompts-popover"
      onToggle={() => (open ? close() : setOpen(true))}
      onClose={close}
    >
      {/* 絞り込みの欄は、一覧をスクロールしても上に残す帯に入れる（欄そのものを貼り付けると、帯の余白で欄の枠と高さが崩れる） */}
      <div className="prompts-search">
        <SearchField
          autoFocus
          value={query}
          onChange={setQuery}
          onKeyDown={(e) => {
            // ⌘Enter はその指示へ移る（Enter は入力欄に入れる）
            if (isKey(e, "Enter", { meta: true })) {
              e.preventDefault();
              jump(items[nav.index]);
            } else nav.onKeyDown(e);
          }}
          placeholder="指示を探す（Enter で入力欄に入れる・⌘Enter でその指示へ移る）"
          label="指示の履歴を探す"
        />
      </div>
      {items.length === 0 && <p className="muted small">合う指示はありません</p>}
      {items.map((p, index) => {
        return (
          <div key={p.id} className={cx("prompt-row", index === nav.index && "active")} onMouseEnter={() => nav.setIndex(index)}>
            <button type="button" className="prompt-jump" title={rowTitle(p)} onClick={() => jump(p)}>
              <span className="prompt-index">{numbers.get(p.id)}</span>
              {p.compactKind && <CompactPromptMark kind={p.compactKind} className="compact-prompt-tag" size={11} />}
              {p.answers && (
                <span className="question-answer-tag">
                  <MessageCircleQuestion size={11} aria-hidden />
                  質問への回答
                </span>
              )}
              <span className="prompt-text">{p.label}</span>
              <time className="prompt-time">{formatMessageTime(p.at)}</time>
            </button>
            {/* 入力欄に入れられない行（質問への回答・添付だけの指示）も、時刻の位置をそろえるためにボタンの場所を空ける */}
            {!p.text && <span className="prompt-reuse-space" aria-hidden />}
            {p.text && (
              <IconButton
                icon={CornerDownLeft}
                size={13}
                label="入力欄に入れる"
                title="この文を入力欄に入れる（そのまま・少し直して送り直せる）"
                onClick={() => reuse(p)}
              />
            )}
          </div>
        );
      })}
    </ComposerChip>
  );
}

/** 行に乗せたときの説明（質問への回答は問いと答えを 1 問ずつ。圧縮前指示・圧縮後指示は札の名前を頭に） */
function rowTitle(p: PromptEntry): string {
  if (p.answers) return `質問への回答\n${p.answers.map((a) => `${a.question}\n→ ${a.answer}`).join("\n\n")}`;
  return p.compactKind ? `${COMPACT_PROMPT_KINDS[p.compactKind].label}: ${p.label}` : p.label;
}
