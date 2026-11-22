import { ChevronRight, ClipboardPenLine, GitBranch, History, Inbox, MessageSquarePlus, Pencil, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { ChatEventOf } from "@shared/chat/chatEvent";
import { subagentAskOf } from "@shared/chat/prompts";
import { handoffRequestExtra } from "@shared/chat/handoff";
import { LOCKED_LABELS } from "@shared/chat/boundaries";
import { cx } from "@/foundation/ui/lib/cx";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { useSizeObserver } from "@/foundation/ui/hooks/useSizeObserver";
import { formatFullDateTime, formatMessageTime } from "@/foundation/ui/lib/time";
import { CopyButton } from "@/foundation/ui/kit/CopyButton";
import { MenuItem } from "@/foundation/ui/kit/PopupMenu";
import { AttachmentChips } from "@/features/attachments/ui";
import { openKey, useOptionalChatScreen, useTimelineBusy, useTimelineOpen, CreatedChatMarks, useBeforeWorkplaceMove } from "@/features/chat/ui";
import { useRewindActions } from "@/features/conversation/ui/rewindContext";
import { BubbleEditor } from "./BubbleEditor";
import { shouldCollapse } from "./collapse";
import { useMessageMenu } from "./useMessageMenu";
import { HandBackFromChip } from "@/features/childChats/ui";
import { COMPACT_PROMPT_KINDS, compactKindOf } from "@/features/compact/ui/compactPromptKinds";
import { CompactPromptMark } from "@/features/compact/ui/CompactPromptMark";
import { useFeatureBlock } from "@/features/ai/ui/provider/chatProvider";
import { useBeforeProviderSwitch } from "@/features/providerSwitch/ui";

/**
 * 自分の発言（吹き出し）。長い発言は途中まで出して「もっと見る / たたむ」で開閉する。
 * 吹き出しの下に、時刻（今日は時刻・7 日以内は曜日・それより前は日付）・コピー・書き直しのボタンを出す。右クリックでも同じ操作。
 * 書き直すと、吹き出しの中で文を直して送り直す（その発言から後ろのやり取りを消して巻き戻す）。
 * 「もう一度送る」は、同じ文と添付を新しい指示として送る（前のやり取りは消さない。途中で圧縮が入って依頼が薄れたときに、すぐ頼み直せるように）。作業中でも送れる。
 * 書き直し・ファイルを戻すのは、チャットの画面の中だけ（サブエージェントのタブではできない）。作業中はできない（作業中かは下の操作の部品だけが timelineBusy で読み、発言全体は作業の始まりと終わりで描き直さない）。
 * 圧縮の前後に送った圧縮前指示・圧縮後指示（記録の pre_compact / post_compact）は、上に「圧縮前指示」「圧縮後指示」と添えて、自分で書いた指示と見分けられるようにする。
 * サブエージェントについて子チャットで聞いた最初の発言は、AI への前置き（記録の読み方）を隠して、上に「サブエージェント『…』について聞く」と添える（コピー・書き直しは書いた文で）。
 * 子チャットに親への依頼文を頼んだ発言（記録の handoff_request。頼み方の文は決まった長い文なので）は、1 行「親への依頼文を頼みました」にたたみ、押すと全文を出す。
 * 追加の指示を添えて頼んだときは、たたんだ行の下にその指示だけを出す（全文を開かなくても、何を頼んだか分かるように）。
 * 子チャットから渡した依頼（記録の handoff_from）は、吹き出しの下に出どころの札「子チャット『…』から」。
 * AI が作業場所を移す予約に書いた続きの指示（記録の workplace_continuation。Kickoff が移したあとに送った）は、上に「作業場所を移したあとの続き（AI の予約）」と添える
 */
/** createdChats: この発言の作業で AI が作った兄弟チャット・親のないチャットの ID（turnExtras.ts の createdChatsByUser） */
export function UserMessage({ event, createdChats }: { event: ChatEventOf<"user">; createdChats?: readonly number[] }) {
  const data = event.data;
  const subagentAsk = subagentAskOf(data.text);
  const text = subagentAsk?.text ?? data.text;
  // 送り直す・書き直すときは前置きを付け直す（添付の記録の読み方を AI に渡したままにする）
  const withHead = (t: string) => (subagentAsk ? data.text.slice(0, data.text.length - subagentAsk.text.length) + t : t);
  const compactKind = compactKindOf(data);
  const handoffRequest = data.handoff_request === true;
  // 依頼文の頼みに添えた追加の指示（なければ null）
  const handoffExtra = handoffRequest ? handoffRequestExtra(data.text) : null;
  // 依頼文の頼みの全文を開いているか
  const [requestOpen, setRequestOpen] = useTimelineOpen(event.chat_id, openKey.handBackText(event.id));
  // 届いていなかったサブエージェントの報告を、この発言に添えて渡した数（reportHandover.ts）
  const handover = data.handover?.length ?? 0;
  const attachments = data.attachments ?? [];
  // 折りたたむほど長いか（描いてから測る）と、開いているか
  const [long, setLong] = useState(false);
  const longRef = useRef(false);
  // 開閉は流れの見え方の店（行が窓から外れて戻っても・画面を作り直しても開いたまま）
  const [expanded, setExpanded] = useTimelineOpen(event.chat_id, openKey.longMessage(event.id));
  // 文の高さは、畳むための max-height の内側の要素で測る（畳んでも文の高さは変わらないので、畳む・開くで行き来しない）。
  // 大きさの知らせで測るので、幅・文字の大きさが変わったら測り直し、画面の外で描くのを省いている間は読まない。
  // 知らせは描く前に届くので、変わったときだけその場で描き直し、畳む前の全文が一瞬見えないようにする（依頼文の頼みは、開いてから測る）
  const measureRef = useSizeObserver<HTMLDivElement>(({ height }) => {
    const next = shouldCollapse(height);
    if (next === longRef.current) return;
    longRef.current = next;
    flushSync(() => setLong(next));
  });
  const screen = useOptionalChatScreen();
  const rewind = useRewindActions();
  // 書き直している文（undefined なら書き直していない）
  const [draft, setDraft] = useState<string>();
  // そのチャットの AI でできないこと（書き直しは分岐・巻き戻しを、ファイルを戻すは控えを使う）
  // 作業場所を移した区切りより前の発言は、会話もファイルも巻き戻せない
  const beforeMove = useBeforeWorkplaceMove(event.chat_id, event.id);
  const beforeSwitch = useBeforeProviderSwitch(event.chat_id, event.id);
  const rewindBlock = useFeatureBlock("fork") ?? (beforeMove ? LOCKED_LABELS.workplace_moved.rewind : beforeSwitch ? LOCKED_LABELS.provider_switched.rewind : null);
  const filesBlock = useFeatureBlock("rewind_files") ?? (beforeMove ? LOCKED_LABELS.workplace_moved.files : beforeSwitch ? LOCKED_LABELS.provider_switched.files : null);
  // 書き直しを始める（作業中かは操作の部品が見る）
  const onEdit = rewind && !rewindBlock ? () => setDraft(text) : undefined;
  // ファイルだけを、この発言を送る前の状態に戻す（ファイルの記録を取り始めてからの発言だけ）
  // 同じ文と添付を、新しい指示としてもう一度送る（文も添付もない発言では出さない）
  const resend = rewind && (text || attachments.length > 0) ? () => void rewind.resend(withHead(text), attachments) : undefined;
  const restoreFiles = rewind && data.message_uuid && !filesBlock ? () => void rewind.restoreFiles(event.id) : undefined;
  const menu = useMessageMenu(text, <UserMessageMenuItems resend={resend} onEdit={onEdit} restoreFiles={restoreFiles} />, { eventId: event.id });
  return (
    <div
      className={cx(
        "user-message",
        draft !== undefined && "editing",
        compactKind && "compact-prompt",
        compactKind && COMPACT_PROMPT_KINDS[compactKind].className,
        handoffRequest && "handoff-request",
        handoffRequest && !requestOpen && "folded",
      )}
    >
      <div className="bubble user" id={`ev-${event.id}`} onContextMenu={menu.open}>
        {compactKind && <CompactPromptMark kind={compactKind} className="message-kind-label" title={COMPACT_PROMPT_KINDS[compactKind].sentTitle} />}
        {data.workplace_continuation && (
          <div className="message-kind-label" title="AI が作業場所を移す予約に書いた続きの指示です。作業が終わったあと、Kickoff が作業場所を移してから送りました">
            <GitBranch size={12} aria-hidden />
            作業場所を移したあとの続き（AI の予約）
          </div>
        )}
        {subagentAsk && (
          <div className="message-kind-label" title="親のチャットのサブエージェントの会話の記録（添付）を読んでから答えるよう、AI に頼んで始めました">
            <MessageSquarePlus size={12} aria-hidden />
            サブエージェント「{subagentAsk.name}」について聞く
          </div>
        )}
        {handoffRequest && (
          <button
            type="button"
            className="handoff-request-toggle"
            aria-expanded={requestOpen}
            title={requestOpen ? "頼み方の文をたたむ" : "頼み方の文（この子チャットの AI に送った全文）を見る"}
            onClick={() => setRequestOpen(!requestOpen)}
          >
            <ClipboardPenLine size={13} aria-hidden />
            <span>親への依頼文を頼みました</span>
            <ChevronRight size={13} aria-hidden className="handoff-request-chevron" />
          </button>
        )}
        {handoffExtra && !requestOpen && <div className="handoff-request-extra">{handoffExtra}</div>}
        {attachments.length > 0 && (
          <div className="bubble-attachments">
            <AttachmentChips attachments={attachments} />
          </div>
        )}
        {draft !== undefined && rewind ? (
          <BubbleEditor
            text={draft}
            onChange={setDraft}
            onCancel={() => setDraft(undefined)}
            onSend={() => rewind.rewind(event.id, withHead(draft))}
          />
        ) : (
          (!handoffRequest || requestOpen) && (
            <div className={cx("bubble-text", long && !expanded && "clamped")}>
              <div ref={measureRef} className="bubble-text-body">
                {text}
              </div>
            </div>
          )
        )}
        {long && draft === undefined && (!handoffRequest || requestOpen) && (
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
        {text && <CopyButton size="sm" text={text} label="メッセージをコピー" className="message-action" />}
        <UserMessageActions resend={resend} onEdit={onEdit} restoreFiles={restoreFiles} canEdit={rewind !== null} rewindBlock={rewindBlock} />
      </div>
      {/* 子チャットから渡した依頼（「親チャットに追加」）の出どころ。押すとその子チャットを開く */}
      {data.handoff_from && (
        <div className="message-handoff-from">
          <HandBackFromChip from={data.handoff_from} />
        </div>
      )}
      {/* この発言から聞いた子チャットと、この発言の作業で AI が作った兄弟チャット・親のないチャットの札 */}
      {screen && <CreatedChatMarks chatId={screen.chatId} eventId={event.id} created={createdChats} />}
      {menu.element}
    </div>
  );
}

type ActionProps = { resend?: () => void; onEdit?: () => void; restoreFiles?: () => void };

/** 発言の右クリックの、送り直す・書き直す・ファイルを戻す（作業中は書き直し・ファイルを戻すを出さない） */
function UserMessageMenuItems({ resend, onEdit, restoreFiles }: ActionProps) {
  const busy = useTimelineBusy();
  return (
    <>
      {resend && <MenuItem onSelect={resend}>もう一度送る</MenuItem>}
      {onEdit && !busy && <MenuItem onSelect={onEdit}>書き直して送り直す</MenuItem>}
      {restoreFiles && !busy && <MenuItem onSelect={restoreFiles}>ファイルをこの発言の前に戻す</MenuItem>}
    </>
  );
}

/**
 * 吹き出しの下の、もう一度送る・書き直す・ファイルを戻すのボタン。作業中かはここだけが読む
 * （作業の始まりと終わりで、発言全体ではなくこのボタンだけが描き直る）
 */
function UserMessageActions({ resend, onEdit, restoreFiles, canEdit, rewindBlock }: ActionProps & { canEdit: boolean; rewindBlock: string | null }) {
  const busy = useTimelineBusy();
  const startEdit = onEdit && !busy ? onEdit : undefined;
  return (
    <>
      {resend && (
        <IconButton
          size="sm"
          icon={RotateCcw}
          iconSize={13}
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
      {canEdit && (
        <IconButton
          size="sm"
          icon={Pencil}
          iconSize={13}
          label="書き直して送り直す"
          title={rewindBlock ?? (busy ? "作業中は書き直せません（止めてから書き直せます）" : "書き直して送り直す（この発言から後ろのやり取りは消えます）")}
          className="message-action"
          disabled={!startEdit}
          onClick={startEdit}
        />
      )}
      {restoreFiles && (
        <IconButton
          size="sm"
          icon={History}
          iconSize={13}
          label="ファイルをこの発言の前に戻す"
          title={busy ? "作業中はファイルを戻せません" : "ファイルだけを、この発言を送る前の状態に戻す（会話はそのまま）"}
          className="message-action"
          disabled={busy}
          onClick={restoreFiles}
        />
      )}
    </>
  );
}
