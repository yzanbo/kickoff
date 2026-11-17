import { ClipboardPenLine, GitBranch } from "lucide-react";
import type { ChatEventOf } from "@shared/types";
import { WORKPLACE_FORK_LOCKED } from "@shared/chat/workplaceMoves";
import { PROVIDER_FORK_LOCKED } from "@shared/chat/providerSwitch";
import { cx } from "@/lib/cx";
import { formatClock, formatElapsed } from "@/lib/time";
import { copyRich } from "@/lib/richCopy";
import { api } from "@/api";
import { openChat } from "@/app/router";
import { reportFailure } from "@/ui/dialogs";
import { CopyButton } from "@/ui/CopyButton";
import { IconButton } from "@/ui/IconButton";
import { useKnownChat } from "@/stores/chats";
import { TurnChanges } from "@/features/chat/tools/TurnChanges";
import type { FileChange } from "@/features/chat/tools/turnFileChanges";
import { FailedTurnActions } from "@/features/chat/rewind/FailedTurnActions";
import { requestHandoff } from "@/features/chat/children/handoff";
import { AddToParentButton } from "@/features/chat/children/AddToParentButton";
import { HandoffMarks } from "@/features/chat/children/HandoffMarks";
import { useFeatureBlock } from "@/features/chat/provider/chatProvider";
import { useBeforeProviderSwitch, useBeforeWorkplaceMove } from "@/features/chat/store/useChatStore";
import type { TurnHandoff } from "./timelineItems";
import { useTimelineBusy } from "./timelineBusy";

/** 作業の終わり: その作業で変えたファイルのカード（あれば）と、終わりの行 */
export function TurnEnd(props: TurnFooterProps & { turnChanges?: FileChange[] }) {
  return (
    <>
      {props.turnChanges && <TurnChanges files={props.turnChanges} chatId={props.event.chat_id} resultId={props.event.id} />}
      <TurnFooter {...props} />
      <FailedTurnActions resultId={props.event.id} />
    </>
  );
}

type TurnFooterProps = {
  event: ChatEventOf<"result">;
  turnStart?: string;
  turnText?: string;
  turnHandoff?: TurnHandoff;
  turnHandoffs?: ChatEventOf<"handoff">[];
};

/**
 * 作業の終わりの行: 中断・失敗の知らせ、作業時間、その作業での返答のコピー、ここから分岐。
 * 時刻に乗せると、終わった時刻を出す。分岐は、その時点の会話の位置が分かるときだけ（作業中は出さない）。
 * 子チャットでは「親チャットに追加 ▾」（最後まで終わった作業の最後の返答を、そのまま親に渡す。依頼文の頼みに答えた作業では文字のボタンで目立たせる）と
 * 「親への依頼文を作ってもらう」（作業中なら、いまの作業に伝える）
 */
function TurnFooter({ event, turnStart, turnText, turnHandoff, turnHandoffs }: TurnFooterProps) {
  const data = event.data;
  // 作業中か（作業の始まりと終わりで、この行だけが描き直る）
  const busy = useTimelineBusy();
  const chat = useKnownChat(event.chat_id);
  const child = chat && chat.parent_chat_id !== null && !chat.archived_at ? chat : undefined;
  // そのチャットの AI で分岐できなければ、押せない形にして理由を出す（メモの仕様書「0021」の Q4）
  // 作業場所を移した区切りより前の地点からは分岐できない（メモの仕様書「0025」の Q3）
  const beforeMove = useBeforeWorkplaceMove(event.chat_id, event.id);
  const beforeSwitch = useBeforeProviderSwitch(event.chat_id, event.id);
  const forkBlock = useFeatureBlock("fork") ?? (beforeMove ? WORKPLACE_FORK_LOCKED : beforeSwitch ? PROVIDER_FORK_LOCKED : null);
  const status = data.status === "cancelled" ? "中断しました" : data.status === "failed" ? `失敗しました: ${data.text ?? ""}` : null;
  const worked = turnStart && formatElapsed(new Date(event.created_at).getTime() - new Date(turnStart).getTime());
  if (!status && !worked && !turnText) return null;
  return (
    <div className={cx("turn-footer event-note", data.status === "failed" && "error")} id={`ev-${event.id}`}>
      {status && <span>{status}</span>}
      {worked && <span title={`${formatClock(event.created_at)} に終了`}>作業時間 {worked}</span>}
      {child && turnHandoff && data.status === "completed" && <AddToParentButton chat={child} turnEventId={event.id} prominent={turnHandoff.requested} />}
      {turnHandoffs && <HandoffMarks handoffs={turnHandoffs} />}
      {/* 書式付き（見出し・表がほかのアプリでも崩れない）と Markdown の文の両方でコピーする */}
      {turnText && <CopyButton copy={() => copyRich(turnText)} label="返答をコピー" className="turn-action" />}
      {/* 止めた・失敗した作業の終わりからは分岐できない（以前の記録には message_id が付いている） */}
      {data.message_id && data.status === "completed" && !busy && (
        <IconButton
          icon={GitBranch}
          label="ここから分岐"
          title={forkBlock ?? "ここから分岐（この時点までの会話で新しいチャットを始める。ファイルの変更は戻さない）"}
          size={13}
          type="button"
          className="turn-action"
          disabled={forkBlock !== null}
          onClick={() =>
            void api
              .forkChat(event.chat_id, event.id)
              .then((chat) => openChat(chat.project_id, chat.id))
              .catch(reportFailure("分岐できませんでした"))
          }
        />
      )}
      {child && (
        <IconButton
          icon={ClipboardPenLine}
          label="親への依頼文を作ってもらう"
          title={
            busy
              ? "親への依頼文を作ってもらう（作業中なので、いまの作業に伝えます。返答は「親チャットに追加」でそのまま親に渡せます）"
              : "親への依頼文を作ってもらう（この子チャットの AI に、親チャットの AI へ渡す依頼文だけを書くよう頼みます。返答は「親チャットに追加」でそのまま親に渡せます）"
          }
          size={13}
          type="button"
          className="turn-action"
          onClick={() => void requestHandoff(child)}
        />
      )}
    </div>
  );
}
