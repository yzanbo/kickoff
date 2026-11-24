import "./TurnEnd.css";
import { ClipboardPenLine, GitBranch } from "lucide-react";
import type { ChatEventOf } from "@shared/chat/chatEvent";
import { LOCKED_LABELS } from "@shared/chat/boundaries";
import { cx } from "@/foundation/ui/lib/cx";
import { formatClock, formatDuration } from "@/foundation/ui/lib/time";
import { copyRich } from "@/features/conversation/ui/richCopy";
import { open } from "@/foundation/ui/navigation/open";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { CopyButton } from "@/foundation/ui/kit/CopyButton";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { useKnownChat } from "@/features/chat/ui/store/knownChats";
import { TurnChanges } from "@/features/conversation/ui/tools/TurnChanges";
import { FailedTurnActions } from "@/features/conversation/ui/rewind/FailedTurnActions";
import { requestHandoff } from "@/features/childChats/ui/handBack";
import { AddToParentButton } from "@/features/childChats/ui/AddToParentButton";
import { HandBackMarks } from "@/features/childChats/ui";
import { useFeatureBlock } from "@/features/ai/ui";
import { useBeforeWorkplaceMove, useTimelineBusy, turnsApi } from "@/features/chat/ui";
import { useBeforeProviderSwitch } from "@/features/providerSwitch/ui";
import type { TurnExtras } from "./turnExtras";
import { turnExtras } from "./selectors";

/**
 * 作業の終わり: その作業で変えたファイルのカード（あれば）と、終わりの行。付け足し（作業時間・返答・変更・親へ渡すもの）は自分の分だけを読む
 * （記録が届いても、この作業の分が変わらなければ描き直さない）
 */
export function TurnEnd({ event }: { event: ChatEventOf<"result"> }) {
  const extras = turnExtras.useWith(event.chat_id, (byEnd) => byEnd.get(event.id));
  return (
    <>
      {extras?.changes && <TurnChanges files={extras.changes} chatId={event.chat_id} resultId={event.id} />}
      <TurnFooter event={event} extras={extras} />
      <FailedTurnActions resultId={event.id} />
    </>
  );
}

/**
 * 作業の終わりの行: 中断・失敗の知らせ、作業時間、その作業での返答のコピー、ここから分岐。
 * 時刻に乗せると、終わった時刻を出す。分岐は、その時点の会話の位置が分かるときだけ（作業中は出さない）。
 * 子チャットでは「親チャットに追加 ▾」（最後まで終わった作業の最後の返答を、そのまま親に渡す。依頼文の頼みに答えた作業では文字のボタンで目立たせる）と
 * 「親への依頼文を作ってもらう」（作業中なら、いまの作業に伝える）
 */
function TurnFooter({ event, extras }: { event: ChatEventOf<"result">; extras: TurnExtras | undefined }) {
  const data = event.data;
  const { start: turnStart, text: turnText, handoff: turnHandoff, handoffs: turnHandoffs } = extras ?? {};
  // 作業中か（作業の始まりと終わりで、この行だけが描き直る）
  const busy = useTimelineBusy();
  const chat = useKnownChat(event.chat_id);
  const child = chat && chat.parent_chat_id !== null && !chat.archived_at ? chat : undefined;
  // そのチャットの AI で分岐できなければ、押せない形にして理由を出す
  // 作業場所を移した区切りより前の地点からは分岐できない
  const beforeMove = useBeforeWorkplaceMove(event.chat_id, event.id);
  const beforeSwitch = useBeforeProviderSwitch(event.chat_id, event.id);
  const forkBlock = useFeatureBlock("fork") ?? (beforeMove ? LOCKED_LABELS.workplace_moved.fork : beforeSwitch ? LOCKED_LABELS.provider_switched.fork : null);
  const status = data.status === "cancelled" ? "中断しました" : data.status === "failed" ? `失敗しました: ${data.text ?? ""}` : null;
  const worked = turnStart && formatDuration(new Date(event.created_at).getTime() - new Date(turnStart).getTime());
  if (!status && !worked && !turnText) return null;
  return (
    <div className={cx("turn-footer event-note", data.status === "failed" && "error")} id={`ev-${event.id}`}>
      {status && <span>{status}</span>}
      {worked && <span title={`${formatClock(event.created_at)} に終了`}>作業時間 {worked}</span>}
      {child && turnHandoff && data.status === "completed" && <AddToParentButton chat={child} turnEventId={event.id} prominent={turnHandoff.requested} />}
      {turnHandoffs && <HandBackMarks handoffs={turnHandoffs} />}
      {/* 書式付き（見出し・表がほかのアプリでも崩れない）と Markdown の文の両方でコピーする */}
      {turnText && <CopyButton size="sm" copy={() => copyRich(turnText)} label="返答をコピー" className="turn-action" />}
      {/* 止めた・失敗した作業の終わりからは分岐できない（以前の記録には message_id が付いている） */}
      {data.message_id && data.status === "completed" && !busy && (
        <IconButton
          size="sm"
          icon={GitBranch}
          label="ここから分岐"
          title={forkBlock ?? "ここから分岐（この時点までの会話で新しいチャットを始める。ファイルの変更は戻さない）"}
          iconSize={13}
          type="button"
          className="turn-action"
          disabled={forkBlock !== null}
          onClick={() =>
            void turnsApi
              .forkChat(event.chat_id, event.id)
              .then((chat) => open({ kind: "chat", projectId: chat.project_id, chatId: chat.id }))
              .catch(reportFailure("分岐できませんでした"))
          }
        />
      )}
      {child && (
        <IconButton
          size="sm"
          icon={ClipboardPenLine}
          label="親への依頼文を作ってもらう"
          title={
            busy
              ? "親への依頼文を作ってもらう（作業中なので、いまの作業に伝えます。返答は「親チャットに追加」でそのまま親に渡せます）"
              : "親への依頼文を作ってもらう（この子チャットの AI に、親チャットの AI へ渡す依頼文だけを書くよう頼みます。返答は「親チャットに追加」でそのまま親に渡せます）"
          }
          iconSize={13}
          type="button"
          className="turn-action"
          onClick={() => void requestHandoff(child)}
        />
      )}
    </div>
  );
}
