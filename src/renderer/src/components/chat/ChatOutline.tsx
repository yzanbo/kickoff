import { ListTree } from "lucide-react";
import { useRef, useState } from "react";
import type { RunEvent } from "../../../../core/types";
import { useDismiss } from "../../hooks/useDismiss";
import { formatMessageTime } from "../../time";
import { IconButton } from "../IconButton";
import { PopoverHeader } from "../PopoverHeader";

/**
 * 発言の目次: このチャットの自分の発言を並べ、押すとその発言へ移る。
 * 見出しのボタンから開く（発言がないときは押せない）
 */
export function ChatOutline({ events, onJump }: { events: RunEvent[]; onJump: (eventId: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useDismiss(ref, () => setOpen(false), { enabled: open });
  const prompts = events.filter((e) => e.type === "user");
  return (
    <span ref={ref} className="chat-outline">
      <IconButton
        icon={ListTree}
        size={13}
        label="発言の目次"
        title={prompts.length ? "発言の目次（自分の発言へ移る）" : "まだ発言がありません"}
        aria-expanded={open}
        disabled={prompts.length === 0}
        onClick={() => setOpen(!open)}
      />
      {open && (
        <div className="chat-outline-popover" role="dialog" aria-label="発言の目次">
          <PopoverHeader title={`発言の目次（${prompts.length}）`} onClose={() => setOpen(false)} />
          <ol className="chat-outline-list">
            {prompts.map((e, i) => {
              const data = e.data as { text?: string; attachments?: { name: string }[] };
              const text = String(data.text ?? "").trim() || (data.attachments ?? []).map((a) => a.name).join("、");
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    className="chat-outline-row"
                    onClick={() => {
                      setOpen(false);
                      onJump(e.id);
                    }}
                  >
                    <span className="chat-outline-index">{i + 1}</span>
                    <span className="chat-outline-text">{text}</span>
                    <time className="muted">{formatMessageTime(e.created_at)}</time>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </span>
  );
}
