import { ChevronUp, CornerDownLeft, History } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChatEvent } from "@shared/types";
import { cx } from "@/lib/cx";
import { useDismiss } from "@/hooks/useDismiss";
import { useListNavigation } from "@/hooks/useListNavigation";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { formatMessageTime } from "@/lib/time";
import { IconButton } from "@/ui/IconButton";
import { SearchField } from "@/ui/SearchField";
import { promptEntries, type PromptEntry } from "./promptHistory";

/**
 * チャット欄の上の「指示の履歴 12」（ToDo・サブエージェントと同じピルの列）。押すと、このチャットで自分が送った指示の一覧を上に開く。
 * 呼び方は、入力欄の「続けて指示する」・「送信待ちの指示」にそろえる。
 * 行を押すとその指示へ移って強調し、行の右のボタンで同じ文を入力欄に入れる（もう一度送る・少し直して送る）。
 * 一覧は会話の順（下ほど新しい）で、開いたらいちばん下（入力欄に近い新しい指示）を見せる。
 * 上の欄で絞り込め、↑↓ で選んで Enter で入力欄に入れる・⌘Enter でその指示へ移る。
 * チャットにピントがあるときの ⌃R でも開く（シェルの履歴の検索と同じ。開いている間の ⌃R は 1 つ前の一致へ）
 */
export function PromptsChip({ events, onJump, onReuse }: { events: ChatEvent[]; onJump: (eventId: number) => void; onReuse: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const prompts = useMemo(() => promptEntries(events), [events]);
  // 行に出す番号（会話の中で何番目の指示か。絞り込んでも変えない）
  const numbers = useMemo(() => new Map(prompts.map((p, i) => [p.id, i + 1])), [prompts]);
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? prompts.filter((p) => p.label.toLowerCase().includes(q)) : prompts;
  }, [prompts, query]);
  const close = () => {
    // 絞り込みの欄にピントがあれば、チャット欄に戻す（欄が消えてピントが外れると、次の Esc でパネルが閉じる）
    if (ref.current?.contains(document.activeElement)) ref.current.closest(".chat-panel")?.querySelector<HTMLElement>(".composer textarea")?.focus();
    setOpen(false);
    setQuery("");
  };
  const reuse = (p: PromptEntry | undefined) => {
    if (!p?.text) return;
    close();
    onReuse(p.text);
  };
  const jump = (p: PromptEntry | undefined) => {
    if (!p) return;
    close();
    onJump(p.id);
  };
  const nav = useListNavigation(items, reuse);
  useDismiss(ref, close, { enabled: open });
  // 開いた・絞り込んだら、いちばん新しい（下の）指示を選ぶ
  useLayoutEffect(() => {
    if (open) nav.setIndex(items.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items]);
  // 選んでいる行を見せる（開いたときは、いちばん下）
  useLayoutEffect(() => {
    listRef.current?.querySelector(".prompt-row.active")?.scrollIntoView({ block: "nearest" });
  }, [open, nav.index]);

  // ⌃R: 開いて絞り込みの欄にピントを置く（開いていれば 1 つ前の一致へ）
  useWindowEvent("keydown", (e) => {
    if (!e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== "r") return;
    if (!ref.current?.closest(".chat-panel")?.contains(document.activeElement)) return;
    e.preventDefault();
    if (!open) setOpen(true);
    else nav.setIndex((i) => Math.max(i - 1, 0));
  });

  if (prompts.length === 0) return null;
  return (
    <div ref={ref} className="chip-wrap">
      <button
        type="button"
        className={cx("composer-chip", open && "open")}
        aria-expanded={open}
        title="このチャットで送った指示の履歴（⌃R。行を押すとその指示へ移り、↵ で入力欄に入れる）"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <History size={14} className="chip-icon" aria-hidden />
        指示の履歴 {prompts.length}
        <ChevronUp size={13} className="chip-chevron" aria-hidden />
      </button>
      {open && (
        <div ref={listRef} className="chip-popover prompts-popover" role="dialog" aria-label="指示の履歴">
          <SearchField
            autoFocus
            value={query}
            onChange={setQuery}
            onKeyDown={(e) => {
              // ⌘Enter はその指示へ移る（Enter は入力欄に入れる）
              if (e.key === "Enter" && e.metaKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                jump(items[nav.index]);
              } else nav.onKeyDown(e);
            }}
            placeholder="指示を探す（Enter で入力欄に入れる・⌘Enter でその指示へ移る）"
            label="指示の履歴を探す"
          />
          {items.length === 0 && <p className="muted small">合う指示はありません</p>}
          {items.map((p, index) => {
            return (
              <div key={p.id} className={cx("prompt-row", index === nav.index && "active")} onMouseEnter={() => nav.setIndex(index)}>
                <button type="button" className="prompt-jump" title={p.label} onClick={() => jump(p)}>
                  <span className="prompt-index">{numbers.get(p.id)}</span>
                  <span className="prompt-text">{p.label}</span>
                  <time className="prompt-time">{formatMessageTime(p.at)}</time>
                </button>
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
        </div>
      )}
    </div>
  );
}
