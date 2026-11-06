import { History, Inbox, Pencil, RotateCcw } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { ChatEventOf } from "@shared/types";
import { cx } from "@/lib/cx";
import { IconButton } from "@/ui/IconButton";
import { formatFullDateTime, formatMessageTime } from "@/lib/time";
import { CopyButton } from "@/ui/CopyButton";
import { MenuItem } from "@/ui/PopupMenu";
import { AttachmentChips } from "@/features/chat/attachments/AttachmentChip";
import { useOptionalChatPane } from "@/features/chat/pane/chatPaneContext";
import { BubbleEditor } from "./BubbleEditor";
import { useMessageMenu } from "./useMessageMenu";
import { ChildChatMarks } from "@/features/chat/children/ChildChatChips";
import { COMPACT_PROMPT_KINDS, compactKindOf } from "@/features/snippet/compactPromptKinds";
import { CompactPromptMark } from "@/features/snippet/CompactPromptMark";

/** 自分の発言を折りたたむ高さ（これより高い発言は、ここまで出して下を薄くする） */
const COLLAPSE_PX = 240;

/**
 * 自分の発言（吹き出し）。長い発言は途中まで出して「もっと見る / たたむ」で開閉する。
 * 吹き出しの下に、時刻（今日は時刻・7 日以内は曜日・それより前は日付）・コピー・書き直しのボタンを出す。右クリックでも同じ操作。
 * 書き直すと、吹き出しの中で文を直して送り直す（その発言から後ろのやり取りを消して巻き戻す）。
 * 「もう一度送る」は、同じ文と添付を新しい指示として送る（前のやり取りは消さない。途中で圧縮が入って依頼が薄れたときに、すぐ頼み直せるように）。作業中でも送れる。
 * 書き直し・ファイルを戻すのは、チャットの画面の中だけ（サブエージェントのタブではできない）。busy（作業中）の間はできない。
 * 圧縮の前後に送った圧縮前指示・圧縮後指示（記録の pre_compact / post_compact）は、上に「圧縮前指示」「圧縮後指示」と添えて、自分で書いた指示と見分けられるようにする
 */
export function UserMessage({ event, busy }: { event: ChatEventOf<"user">; busy: boolean }) {
  const data = event.data;
  const text = data.text;
  const compactKind = compactKindOf(data);
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
  const pane = useOptionalChatPane();
  // 書き直している文（undefined なら書き直していない）
  const [draft, setDraft] = useState<string>();
  const startEdit = pane && !busy ? () => setDraft(text) : undefined;
  // ファイルだけを、この発言を送る前の状態に戻す（ファイルの記録を取り始めてからの発言だけ）
  // 同じ文と添付を、新しい指示としてもう一度送る（文も添付もない発言では出さない）
  const resend = pane && (text || attachments.length > 0) ? () => void pane.resend(text, attachments) : undefined;
  const restoreFiles = pane && data.message_uuid ? () => void pane.restoreFiles(event.id) : undefined;
  const menu = useMessageMenu(
    text,
    <>
      {resend && <MenuItem onSelect={resend}>もう一度送る</MenuItem>}
      {startEdit && <MenuItem onSelect={startEdit}>書き直して送り直す</MenuItem>}
      {restoreFiles && !busy && <MenuItem onSelect={restoreFiles}>ファイルをこの発言の前に戻す</MenuItem>}
    </>,
    { eventId: event.id },
  );
  return (
    <div className={cx("user-message", draft !== undefined && "editing", compactKind && "compact-prompt", compactKind && COMPACT_PROMPT_KINDS[compactKind].className)}>
      <div className="bubble user" id={`ev-${event.id}`} onContextMenu={menu.open}>
        {compactKind && <CompactPromptMark kind={compactKind} className="message-kind-label" title={COMPACT_PROMPT_KINDS[compactKind].sentTitle} />}
        {attachments.length > 0 && (
          <div className="bubble-attachments">
            <AttachmentChips attachments={attachments} />
          </div>
        )}
        {draft !== undefined && pane ? (
          <BubbleEditor
            text={draft}
            onChange={setDraft}
            onCancel={() => setDraft(undefined)}
            onSend={() => pane.rewind(event.id, draft)}
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
        {resend && (
          <IconButton
            icon={RotateCcw}
            size={13}
            label="もう一度送る"
            title={
              busy
                ? "この発言を新しい指示としてもう一度送る（作業中なので、チャット欄の送り方（いま / あとで）で送ります）"
                : "この発言を新しい指示としてもう一度送る（添付も同じ。前のやり取りは残ります）"
            }
            className="message-action"
            onClick={resend}
          />
        )}
        {pane && (
          <IconButton
            icon={Pencil}
            size={13}
            label="書き直して送り直す"
            title={busy ? "作業中は書き直せません（止めてから書き直せます）" : "書き直して送り直す（この発言から後ろのやり取りは消えます）"}
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
            title={busy ? "作業中はファイルを戻せません" : "ファイルだけを、この発言を送る前の状態に戻す（会話はそのまま）"}
            className="message-action"
            disabled={busy}
            onClick={restoreFiles}
          />
        )}
      </div>
      {/* この発言から聞いた子チャットの札 */}
      {pane && <ChildChatMarks chatId={pane.chatId} eventId={event.id} />}
      {menu.element}
    </div>
  );
}
