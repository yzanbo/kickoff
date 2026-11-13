import { ChevronRight, ClipboardPenLine, Eraser, GitBranch } from "lucide-react";
import { memo } from "react";
import type { ChatEvent, ChatEventOf } from "@shared/types";
import { cx } from "@/lib/cx";
import { formatClock, formatElapsed, formatFullStamp, formatStamp } from "@/lib/time";
import { api } from "@/api";
import { openChat } from "@/app/router";
import { reportFailure } from "@/ui/dialogs";
import { CopyButton } from "@/ui/CopyButton";
import { IconButton } from "@/ui/IconButton";
import { useKnownChat } from "@/stores/chats";
import type { TimelineItem, TurnHandoff } from "./timelineItems";
import { TurnChanges } from "@/features/chat/tools/TurnChanges";
import type { FileChange } from "@/features/chat/tools/turnFileChanges";
import { ToolGroup } from "@/features/chat/tools/ToolGroup";
import { AssistantMessage } from "@/features/chat/messages/AssistantMessage";
import { UserMessage } from "@/features/chat/messages/UserMessage";
import { QuestionAnswerMessage } from "@/features/chat/messages/QuestionAnswerMessage";
import { copyRich } from "@/lib/richCopy";
import { FailedTurnActions } from "@/features/chat/rewind/FailedTurnActions";
import { SubagentCard } from "@/features/chat/subagents/SubagentCard";
import type { RenderItems } from "@/features/chat/subagents/subagentParts";
import { SubagentEndNote } from "@/features/chat/subagents/SubagentEndNote";
import { CompactedRow } from "@/features/chat/status/CompactingRow";
import { requestHandoff } from "@/features/chat/children/handoff";
import { AddToParentButton } from "@/features/chat/children/AddToParentButton";
import { HandoffMarks } from "@/features/chat/children/HandoffMarks";

/**
 * タイムライン（発言とツールのまとまり）。rel はリポジトリの絶対パスを相対パスにする。
 * active（作業中）なら、いまの作業（最後の作業の終わりより後）の結果の届いていないツールを実行中として見せる
 * （前の作業で中断したまま結果のない呼び出しは、実行中にしない）
 */
export function TimelineItems({ items, rel, active }: { items: TimelineItem[]; rel: (s: string) => string; active: boolean }) {
  const floor = active ? items.findLastIndex((item) => item.kind === "event" && item.event.type === "result") : items.length;
  // 各項目は memo して、変わっていない発言・ツールは描き直さない（作業中は返答が届くたびに流れ全体が描き直されるため。
  // 長いチャットで Markdown を毎回解析し直すと、そのたびに 100ms ほどかかり、入力が重くなる）
  // サブエージェントのカードの中身も、同じ部品で描く（入れ子のカードもこの中で描かれる）
  const renderItems: RenderItems = (inner, innerActive) => <TimelineItems items={inner} rel={rel} active={innerActive} />;
  return items.map((item, i) => {
    switch (item.kind) {
      case "tools":
        return <MemoToolGroup key={item.key} tools={item.tools} rel={rel} active={i > floor} />;
      case "subagent":
        return <SubagentCard key={item.key} call={item.call} rel={rel} renderItems={renderItems} />;
      case "subagentEnd":
        return <SubagentEndNote key={item.key} event={item.event} agentKey={item.agentKey} />;
      default:
        return (
          <MemoEventItem
            key={item.key}
            event={item.event}
            turnStart={item.turnStart}
            turnText={item.turnText}
            turnChanges={item.turnChanges}
            turnHandoff={item.turnHandoff}
            turnHandoffs={item.turnHandoffs}
            busy={active}
          />
        );
    }
  });
}

/** ツールのまとまり: 呼び出しと結果の記録が同じなら描き直さない（まとまりの配列は記録が増えるたびに作り直されるため、中身で比べる） */
const MemoToolGroup = memo(
  ToolGroup,
  (a, b) =>
    a.rel === b.rel &&
    a.active === b.active &&
    a.tools.length === b.tools.length &&
    a.tools.every((t, i) => t.use === b.tools[i].use && t.result === b.tools[i].result),
);

/**
 * 思考の行（「8秒間思考しました」。中身があれば開いて読める）。後ろに考え始めた時刻
 * （記録は考え終えたときに残るので、かかった時間を引く。乗せると年月日と考え終えた時刻）
 */
function Thinking({ text, durationMs, at }: { text: string; durationMs?: number; at: string }) {
  const label =
    durationMs === undefined ? "思考しました" : `${formatElapsed(durationMs)}${durationMs < 3_600_000 ? "間" : ""}思考しました`;
  const start = new Date(Date.parse(at) - (durationMs ?? 0)).toISOString();
  const time = (
    <span className="event-time" title={`開始 ${formatFullStamp(start)}\n終了 ${formatFullStamp(at)}`}>
      {formatStamp(start)}
    </span>
  );
  if (!text.trim())
    return (
      <div className="event-note thinking">
        {label}
        {time}
      </div>
    );
  return (
    <details className="event-note thinking">
      <summary>
        <ChevronRight size={13} className="tool-chevron" />
        {label}
        {time}
      </summary>
      <div className="thinking-body">{text}</div>
    </details>
  );
}

/** 作業の終わり: その作業で変えたファイルのカード（あれば）と、終わりの行 */
function TurnEnd(props: TurnFooterProps & { turnChanges?: FileChange[] }) {
  return (
    <>
      {props.turnChanges && <TurnChanges files={props.turnChanges} />}
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
  busy: boolean;
};

/**
 * 作業の終わりの行: 中断・失敗の知らせ、作業時間、その作業での返答のコピー、ここから分岐。
 * 時刻に乗せると、終わった時刻を出す。分岐は、その時点の会話の位置が分かるときだけ（作業中は出さない）。
 * 子チャットでは「親チャットに追加 ▾」（最後まで終わった作業の最後の返答を、そのまま親に渡す。依頼文の頼みに答えた作業では文字のボタンで目立たせる）と
 * 「親への依頼文を作ってもらう」（作業中なら、いまの作業に伝える）
 */
function TurnFooter({ event, turnStart, turnText, turnHandoff, turnHandoffs, busy }: TurnFooterProps) {
  const data = event.data;
  const chat = useKnownChat(event.chat_id);
  const child = chat && chat.parent_chat_id !== null && !chat.archived_at ? chat : undefined;
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
          title="ここから分岐（この時点までの会話で新しいチャットを始める。ファイルの変更は戻さない）"
          size={13}
          type="button"
          className="turn-action"
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

const RESOLVED_LABELS: Record<string, string> = {
  allow: "許可しました",
  allow_always: "常に許可しました",
  deny: "拒否しました",
  answer: "質問に回答しました",
};

/** 発言・お知らせ 1 件（作業の終わりには、作業時間と返答のコピーを出す） */
const MemoEventItem = memo(EventItem);

function EventItem({
  event,
  turnStart,
  turnText,
  turnChanges,
  turnHandoff,
  turnHandoffs,
  busy,
}: {
  event: ChatEvent;
  turnStart?: string;
  turnText?: string;
  turnChanges?: FileChange[];
  turnHandoff?: TurnHandoff;
  turnHandoffs?: ChatEventOf<"handoff">[];
  busy: boolean;
}) {
  switch (event.type) {
    case "user":
      return <UserMessage event={event} busy={busy} />;
    case "text":
      return <AssistantMessage event={event} />;
    case "thinking":
      return <Thinking text={event.data.text} durationMs={event.data.duration_ms} at={event.created_at} />;
    case "approval_resolved": {
      // AI からの質問に答えた内容は、自分の発言と同じ吹き出しで「質問への回答」として出す
      const data = event.data;
      if (data.action === "answer") return <QuestionAnswerMessage event={event} data={data} />;
      if (data.kind === "question" && data.action === "deny") return <div className="event-note">質問をスキップしました</div>;
      return <div className="event-note">{RESOLVED_LABELS[data.action] ?? "回答済み"}</div>;
    }
    case "result":
      return <TurnEnd event={event} turnStart={turnStart} turnText={turnText} turnChanges={turnChanges} turnHandoff={turnHandoff} turnHandoffs={turnHandoffs} busy={busy} />;
    case "error":
      return (
        <div className="event-note error" id={`ev-${event.id}`}>
          {event.data.message}
        </div>
      );
    case "notice":
      return (
        <div className="event-note" id={`ev-${event.id}`}>
          {event.data.message}
        </div>
      );
    case "compact":
      // 手で圧縮したとき・上限に近づいて自動で圧縮されたとき（圧縮中の行と同じ枠のまま残す）
      return <CompactedRow event={event} />;
    case "context_cleared":
      // 送信待ちの「コンテキストを消去」で、ここから新しい会話にした境目（上の会話は AI に引き継いでいない）
      return (
        <div className="context-cleared-divider" id={`ev-${event.id}`} role="separator" aria-label="コンテキストを消去しました">
          <Eraser size={12} aria-hidden />
          <span>コンテキストを消去しました（ここから新しい会話）</span>
        </div>
      );
    default:
      return null;
  }
}
