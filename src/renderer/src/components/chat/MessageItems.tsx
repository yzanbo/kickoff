import { Pencil } from "lucide-react";
import { createContext, useContext, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import type { Attachment, RunEvent } from "../../../../core/types";
import { cx } from "../../cx";
import { confirmDialog } from "../../dialogs";
import { errorMessage } from "../../errors";
import { ErrorText } from "../ErrorText";
import { IconButton } from "../IconButton";
import { reportFailure } from "../../runActions";
import { formatFullDateTime, formatMessageTime } from "../../time";
import { CopyButton } from "../CopyButton";
import { Markdown } from "../Markdown";
import { clampToViewport, MenuItem, PopupMenu } from "../PopupMenu";
import { AttachmentChip } from "./AttachmentChip";

/**
 * 自分の発言を書き直して送り直す（チャットの画面が渡す。サブエージェントの中身など、渡さない所では書き直せない）。
 * busy の間（作業中）は書き直せない
 */
export const RewindContext = createContext<{ busy: boolean; send: (eventId: number, text: string) => Promise<void> } | null>(null);

/** 自分の発言を折りたたむ高さ（これより高い発言は、ここまで出して下を薄くする） */
const COLLAPSE_PX = 240;

/**
 * 自分の発言（吹き出し）。長い発言は途中まで出して「もっと見る / たたむ」で開閉する。
 * 吹き出しの下に、時刻（今日は時刻・7 日以内は曜日・それより前は日付）・コピー・書き直しのボタンを出す。右クリックでも同じ操作。
 * 書き直すと、吹き出しの中で文を直して送り直す（その発言から後ろのやり取りを消して巻き戻す）
 */
export function UserMessage({ event }: { event: RunEvent }) {
  const data = event.data as { text?: string; attachments?: Attachment[] };
  const text = String(data.text ?? "");
  const attachments = data.attachments ?? [];
  const bodyRef = useRef<HTMLDivElement>(null);
  // 折りたたむほど長いか（描いてから測る）と、開いているか
  const [long, setLong] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (el) setLong(el.scrollHeight > COLLAPSE_PX + 40);
  }, [text]);
  const rewind = useContext(RewindContext);
  // 書き直している文（undefined なら書き直していない）
  const [draft, setDraft] = useState<string>();
  const startEdit = rewind && !rewind.busy ? () => setDraft(text) : undefined;
  const menu = useMessageMenu(text, startEdit && <MenuItem onSelect={startEdit}>書き直して送り直す</MenuItem>);
  return (
    <div className={cx("user-message", draft !== undefined && "editing")}>
      <div className="bubble user" id={`ev-${event.id}`} onContextMenu={menu.open}>
        {attachments.length > 0 && (
          <div className="bubble-attachments">
            {attachments.map((a) => (
              <AttachmentChip key={a.id} attachment={a} />
            ))}
          </div>
        )}
        {draft !== undefined && rewind ? (
          <BubbleEditor
            text={draft}
            onChange={setDraft}
            onCancel={() => setDraft(undefined)}
            onSend={async () => {
              const ok = await confirmDialog({
                title: "この発言から書き直して送り直しますか？",
                message: "この発言から後ろのやり取りは消えます。AI が変えたファイルは元に戻りません。",
                confirmLabel: "送り直す",
              });
              if (!ok) return false;
              await rewind.send(event.id, draft);
              return true;
            }}
          />
        ) : (
          <div ref={bodyRef} className={cx("bubble-text", long && !expanded && "clamped")}>
            {text}
          </div>
        )}
        {long && draft === undefined && (
          <button type="button" className="bubble-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
            {expanded ? "たたむ" : "もっと見る"}
          </button>
        )}
      </div>
      <div className="message-meta">
        <time dateTime={event.created_at} title={formatFullDateTime(event.created_at)}>
          {formatMessageTime(event.created_at)}
        </time>
        {text && <CopyButton text={text} label="メッセージをコピー" className="message-action" />}
        {rewind && (
          <IconButton
            icon={Pencil}
            size={13}
            label="書き直して送り直す"
            title={rewind.busy ? "作業中は書き直せません（止めてから書き直せます）" : "書き直して送り直す（この発言から後ろのやり取りは消えます）"}
            className="message-action"
            disabled={!startEdit}
            onClick={startEdit}
          />
        )}
      </div>
      {menu.element}
    </div>
  );
}

/** AI の返答 1 つ（右クリックで、この返答だけをコピーできる） */
export function AssistantMessage({ event }: { event: RunEvent }) {
  const data = event.data as { text?: string; sub?: boolean };
  const text = String(data.text ?? "");
  const menu = useMessageMenu(text);
  return (
    <>
      <div className={cx("assistant", Boolean(data.sub) && "sub")} id={`ev-${event.id}`} onContextMenu={menu.open}>
        <Markdown>{text}</Markdown>
      </div>
      {menu.element}
    </>
  );
}

/**
 * 発言の右クリックのメニュー（メッセージをコピー。文を選んでいれば、選んだ文のコピーも）。
 * リンク・入力欄・コードブロックの上などでは、Electron の既定のメニューに任せず、この 1 つにそろえる
 */
function useMessageMenu(text: string, extra?: ReactNode): { open: (e: MouseEvent) => void; element: ReactNode } {
  const [at, setAt] = useState<{ x: number; y: number; selected: string }>();
  const copy = (value: string) => void navigator.clipboard.writeText(value).catch(reportFailure("コピーできませんでした"));
  return {
    open: (e) => {
      if (!text) return;
      e.preventDefault();
      // 発言の中で選んでいる文（ほかの発言にまたがる選択は、この発言の分だけでなく全体をそのまま使う）
      const selection = window.getSelection();
      const selected = selection && !selection.isCollapsed && e.currentTarget.contains(selection.anchorNode) ? selection.toString() : "";
      setAt({ ...clampToViewport(e.clientX, e.clientY, 200, 80), selected });
    },
    element: at && (
      <PopupMenu x={at.x} y={at.y} label="発言の操作" onClose={() => setAt(undefined)}>
        {at.selected && <MenuItem onSelect={() => copy(at.selected)}>選んだ文をコピー</MenuItem>}
        <MenuItem onSelect={() => copy(text)}>メッセージをコピー</MenuItem>
        {extra}
      </PopupMenu>
    ),
  };
}

/** 吹き出しの中の書き直しの欄（Enter で送り直す・Shift+Enter で改行・Esc でやめる）。onSend は確かめてやめたら false */
function BubbleEditor({
  text,
  onChange,
  onCancel,
  onSend,
}: {
  text: string;
  onChange: (text: string) => void;
  onCancel: () => void;
  onSend: () => Promise<boolean>;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    setError(undefined);
    try {
      if (await onSend()) onCancel();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      void send();
    }
  };
  return (
    <div className="bubble-editor">
      <textarea
        value={text}
        rows={Math.min(12, Math.max(2, text.split("\n").length))}
        aria-label="発言を書き直す"
        // 開いたら文の終わりから書き始める
        ref={(el) => {
          if (el && !el.dataset.ready) {
            el.dataset.ready = "1";
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
          }
        }}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <ErrorText message={error} />
      <div className="bubble-editor-actions">
        <button type="button" className="btn btn-sm" disabled={sending} onClick={onCancel}>
          やめる
        </button>
        <button type="button" className="btn btn-sm btn-primary" disabled={sending || !text.trim()} onClick={() => void send()}>
          {sending ? "送信中…" : "送り直す"}
        </button>
      </div>
    </div>
  );
}
