import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { Attachment, RunEvent } from "../../../../core/types";
import { cx } from "../../cx";
import { reportFailure } from "../../runActions";
import { formatFullDateTime, formatMessageTime } from "../../time";
import { CopyButton } from "../CopyButton";
import { Markdown } from "../Markdown";
import { clampToViewport, MenuItem, PopupMenu } from "../PopupMenu";
import { AttachmentChip } from "./AttachmentChip";

/** 自分の発言を折りたたむ高さ（これより高い発言は、ここまで出して下を薄くする） */
const COLLAPSE_PX = 240;

/**
 * 自分の発言（吹き出し）。長い発言は途中まで出して「もっと見る / たたむ」で開閉する。
 * 吹き出しの下に、時刻（今日は時刻・7 日以内は曜日・それより前は日付）とコピーのボタンを出す。右クリックでも同じ操作
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
  const menu = useMessageMenu(text);
  return (
    <div className="user-message">
      <div className="bubble user" id={`ev-${event.id}`} onContextMenu={menu.open}>
        {attachments.length > 0 && (
          <div className="bubble-attachments">
            {attachments.map((a) => (
              <AttachmentChip key={a.id} attachment={a} />
            ))}
          </div>
        )}
        <div ref={bodyRef} className={cx("bubble-text", long && !expanded && "clamped")}>
          {text}
        </div>
        {long && (
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
function useMessageMenu(text: string): { open: (e: MouseEvent) => void; element: ReactNode } {
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
      </PopupMenu>
    ),
  };
}
