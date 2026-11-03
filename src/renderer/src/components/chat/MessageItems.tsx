import { History, Inbox, Pencil } from "lucide-react";
import { createContext, useContext, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import type { Attachment, RunEvent } from "../../../../core/types";
import { cx } from "../../cx";
import { errorMessage } from "../../errors";
import { ErrorText } from "../ErrorText";
import { IconButton } from "../IconButton";
import { reportFailure } from "../../runActions";
import { formatFullDateTime, formatMessageTime } from "../../time";
import { CopyButton } from "../CopyButton";
import { Markdown } from "../Markdown";
import { clampToViewport, MenuItem, PopupMenu } from "../PopupMenu";
import { AttachmentChip } from "./AttachmentChip";
import { copyRich } from "../../richCopy";

/**
 * 自分の発言を書き直して送り直す・ファイルだけ戻す（チャットの画面が渡す。サブエージェントの中身など、渡さない所ではできない）。
 * busy の間（作業中）はできない。send は確かめ（会話だけ / ファイルも）を含み、やめたら false。
 * restoreFiles はファイルだけを、その発言を送る前の状態に戻す（会話はそのまま）
 */
export const RewindContext = createContext<{
  busy: boolean;
  send: (eventId: number, text: string) => Promise<boolean>;
  restoreFiles: (eventId: number) => Promise<void>;
} | null>(null);

/** 自分の発言を折りたたむ高さ（これより高い発言は、ここまで出して下を薄くする） */
const COLLAPSE_PX = 240;

/**
 * 自分の発言（吹き出し）。長い発言は途中まで出して「もっと見る / たたむ」で開閉する。
 * 吹き出しの下に、時刻（今日は時刻・7 日以内は曜日・それより前は日付）・コピー・書き直しのボタンを出す。右クリックでも同じ操作。
 * 書き直すと、吹き出しの中で文を直して送り直す（その発言から後ろのやり取りを消して巻き戻す）
 */
export function UserMessage({ event }: { event: RunEvent }) {
  const data = event.data as { text?: string; attachments?: Attachment[]; handover?: string[]; message_uuid?: string };
  const text = String(data.text ?? "");
  // 届いていなかったサブエージェントの報告を、この発言に添えて渡した数（reportHandover.ts）
  const handover = data.handover?.length ?? 0;
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
  // ファイルだけを、この発言を送る前の状態に戻す（ファイルの記録を取り始めてからの発言だけ）
  const restoreFiles = rewind && data.message_uuid ? () => void rewind.restoreFiles(event.id) : undefined;
  const menu = useMessageMenu(
    text,
    <>
      {startEdit && <MenuItem onSelect={startEdit}>書き直して送り直す</MenuItem>}
      {restoreFiles && !rewind?.busy && <MenuItem onSelect={restoreFiles}>ファイルをこの発言の前に戻す</MenuItem>}
    </>,
  );
  return (
    <div className={cx("user-message", draft !== undefined && "editing")}>
      <div className="bubble user" id={`ev-${event.id}`} onContextMenu={menu.open}>
        {attachments.length > 0 && (
          <div className="bubble-attachments">
            {attachments.map((a) => (
              <AttachmentChip key={a.id} attachment={a} siblings={attachments} />
            ))}
          </div>
        )}
        {draft !== undefined && rewind ? (
          <BubbleEditor
            text={draft}
            onChange={setDraft}
            onCancel={() => setDraft(undefined)}
            onSend={() => rewind.send(event.id, draft)}
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
        {handover > 0 && (
          <span className="message-handover" title="前の作業が受け取る前に終わっていたサブエージェントの報告を、この指示に添えて渡しました">
            <Inbox size={12} aria-hidden />
            サブエージェントの報告 {handover} 件を添えました
          </span>
        )}
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
        {restoreFiles && (
          <IconButton
            icon={History}
            size={13}
            label="ファイルをこの発言の前に戻す"
            title={rewind?.busy ? "作業中はファイルを戻せません" : "ファイルだけを、この発言を送る前の状態に戻す（会話はそのまま）"}
            className="message-action"
            disabled={rewind?.busy}
            onClick={restoreFiles}
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
  const menu = useMessageMenu(text, undefined, { rich: true });
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
 * rich（AI の返答）なら「メッセージをコピー」は書式付き（ほかのアプリに貼っても見出し・表が崩れない）で、Markdown のままのコピーも並べる。
 * リンク・入力欄・コードブロックの上などでは、Electron の既定のメニューに任せず、この 1 つにそろえる
 */
function useMessageMenu(text: string, extra?: ReactNode, { rich = false }: { rich?: boolean } = {}): { open: (e: MouseEvent) => void; element: ReactNode } {
  const [at, setAt] = useState<{ x: number; y: number; selected: string }>();
  const copy = (value: string) => void navigator.clipboard.writeText(value).catch(reportFailure("コピーできませんでした"));
  const copyFormatted = (value: string) => void copyRich(value).catch(reportFailure("コピーできませんでした"));
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
        <MenuItem onSelect={() => (rich ? copyFormatted(text) : copy(text))}>メッセージをコピー</MenuItem>
        {rich && <MenuItem onSelect={() => copy(text)}>Markdown のままコピー</MenuItem>}
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
