import { ChevronUp, CornerDownLeft, History } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { RunEvent } from "../../../../core/types";
import { cx } from "../../cx";
import { useDismiss } from "../../hooks/useDismiss";
import { formatMessageTime } from "../../time";
import { IconButton } from "../IconButton";

/**
 * チャット欄の上の「指示の履歴 12」（ToDo・サブエージェントと同じピルの列）。押すと、このチャットで自分が送った指示の一覧を上に開く。
 * 呼び方は、入力欄の「続けて指示する」・「送信待ちの指示」にそろえる。
 * 行を押すとその指示へ移って強調し、行の右のボタンで同じ文を入力欄に入れる（もう一度送る・少し直して送る）。
 * 一覧は会話の順（下ほど新しい）で、開いたらいちばん下（入力欄に近い新しい指示）を見せる
 */
export function PromptsChip({ events, onJump, onReuse }: { events: RunEvent[]; onJump: (eventId: number) => void; onReuse: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useDismiss(ref, () => setOpen(false), { enabled: open });
  useLayoutEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [open]);
  const prompts = events.filter((e) => e.type === "user");
  if (prompts.length === 0) return null;
  return (
    <div ref={ref} className="chip-wrap">
      <button
        type="button"
        className={cx("composer-chip", open && "open")}
        aria-expanded={open}
        title="このチャットで送った指示の履歴（行を押すとその指示へ移り、↵ で入力欄に入れる）"
        onClick={() => setOpen(!open)}
      >
        <History size={14} className="chip-icon" aria-hidden />
        指示の履歴 {prompts.length}
        <ChevronUp size={13} className="chip-chevron" aria-hidden />
      </button>
      {open && (
        <div ref={listRef} className="chip-popover prompts-popover" role="dialog" aria-label="指示の履歴">
          {prompts.map((e, i) => {
            const data = e.data as { text?: string; attachments?: { name: string }[] };
            const text = String(data.text ?? "").trim();
            const label = text || (data.attachments ?? []).map((a) => a.name).join("、");
            return (
              <div key={e.id} className="prompt-row">
                <button
                  type="button"
                  className="prompt-jump"
                  title={label}
                  onClick={() => {
                    setOpen(false);
                    onJump(e.id);
                  }}
                >
                  <span className="prompt-index">{i + 1}</span>
                  <span className="prompt-text">{label}</span>
                  <time className="prompt-time">{formatMessageTime(e.created_at)}</time>
                </button>
                {text && (
                  <IconButton
                    icon={CornerDownLeft}
                    size={13}
                    label="入力欄に入れる"
                    title="この文を入力欄に入れる（そのまま・少し直して送り直せる）"
                    onClick={() => {
                      setOpen(false);
                      onReuse(text);
                    }}
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
