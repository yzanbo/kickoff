import { ChevronRight, GitBranch } from "lucide-react";
import { memo, type ReactNode } from "react";
import type { RunEvent } from "../../../../core/types";
import { cx } from "../../cx";
import { formatTokens } from "../../format";
import { useTicker } from "../../hooks/useTicker";
import { formatClock, formatElapsed } from "../../time";
import { api } from "../../api";
import { openRun } from "../../router";
import { reportFailure } from "../../runActions";
import { CopyButton } from "../CopyButton";
import { IconButton } from "../IconButton";
import type { TimelineItem } from "./timelineItems";
import { ToolGroup } from "./ToolGroup";
import { AssistantMessage, UserMessage } from "./MessageItems";

/**
 * タイムライン（発言とツールのまとまり）。rel はリポジトリの絶対パスを相対パスにする。
 * active なら、最後のツールのまとまりを実行中として見せる
 */
export function TimelineItems({ items, rel, active }: { items: TimelineItem[]; rel: (s: string) => string; active: boolean }) {
  // 各項目は memo して、変わっていない発言・ツールは描き直さない（作業中は返答が届くたびに流れ全体が描き直されるため。
  // 長いチャットで Markdown を毎回解析し直すと、そのたびに 100ms ほどかかり、入力が重くなる）
  return items.map((item, i) =>
    item.kind === "tools" ? (
      <MemoToolGroup key={item.key} tools={item.tools} rel={rel} active={active && i === items.length - 1} />
    ) : (
      <MemoEventItem key={item.key} event={item.event} turnStart={item.turnStart} turnText={item.turnText} busy={active} />
    ),
  );
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

/** 「考えています」などの、エージェントが動いている印。since があれば、そこからの経過時間を添える（ツールの実行中も数える） */
export function Working({ children, since }: { children: ReactNode; since?: string | null }) {
  return (
    <div className="working">
      <span className="dots" aria-hidden>
        <span />
        <span />
        <span />
      </span>
      {children}
      {since && <Elapsed since={since} />}
    </div>
  );
}

/** 経過時間（1 秒ごとに進める。描き直しをこの中だけに閉じる） */
function Elapsed({ since }: { since: string }) {
  useTicker(1000);
  return <span className="working-elapsed">{formatElapsed(Date.now() - new Date(since).getTime())}</span>;
}

/** 思考の行（「8秒間思考しました」。中身があれば開いて読める） */
function Thinking({ text, durationMs }: { text: string; durationMs?: number }) {
  const label =
    durationMs === undefined ? "思考しました" : `${formatElapsed(durationMs)}${durationMs < 3_600_000 ? "間" : ""}思考しました`;
  if (!text.trim()) return <div className="event-note thinking">{label}</div>;
  return (
    <details className="event-note thinking">
      <summary>
        <ChevronRight size={13} className="tool-chevron" />
        {label}
      </summary>
      <div className="thinking-body">{text}</div>
    </details>
  );
}

/**
 * 作業の終わりの行: 中断・失敗の知らせ、作業時間、その作業での返答のコピー、ここから分岐。
 * 時刻に乗せると、終わった時刻を出す。分岐は、その時点の会話の位置が分かるときだけ（作業中は出さない）
 */
function TurnFooter({ event, turnStart, turnText, busy }: { event: RunEvent; turnStart?: string; turnText?: string; busy: boolean }) {
  const data = event.data as { status?: string; text?: string; message_id?: string };
  const status =
    data.status === "cancelled" ? "中断しました" : data.status === "failed" ? `失敗しました: ${String(data.text ?? "")}` : null;
  const worked = turnStart && formatElapsed(new Date(event.created_at).getTime() - new Date(turnStart).getTime());
  if (!status && !worked && !turnText) return null;
  return (
    <div className={cx("turn-footer event-note", data.status === "failed" && "error")}>
      {status && <span>{status}</span>}
      {worked && <span title={`${formatClock(event.created_at)} に終了`}>作業時間 {worked}</span>}
      {turnText && <CopyButton text={turnText} label="返答をコピー" className="turn-action" />}
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
              .forkRun(event.run_id, event.id)
              .then((run) => openRun(run.project_id, run.id))
              .catch(reportFailure("分岐できませんでした"))
          }
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

function EventItem({ event, turnStart, turnText, busy }: { event: RunEvent; turnStart?: string; turnText?: string; busy: boolean }) {
  const data = event.data as Record<string, unknown>;
  switch (event.type) {
    case "user":
      return <UserMessage event={event} />;
    case "text":
      return <AssistantMessage event={event} />;
    case "thinking":
      return <Thinking text={String(data.text ?? "")} durationMs={data.duration_ms as number | undefined} />;
    case "approval_resolved":
      return <div className="event-note">{RESOLVED_LABELS[String(data.action)] ?? "回答済み"}</div>;
    case "result":
      return <TurnFooter event={event} turnStart={turnStart} turnText={turnText} busy={busy} />;
    case "error":
      return <div className="event-note error">{String(data.message)}</div>;
    case "notice":
      return <div className="event-note">{String(data.message)}</div>;
    case "compact": {
      // 手で圧縮したとき・上限に近づいて自動で圧縮されたとき
      const { trigger, pre_tokens, post_tokens } = data as { trigger: "manual" | "auto"; pre_tokens: number; post_tokens?: number };
      return (
        <div className="event-note">
          ここまでの会話を要約しました（{trigger === "auto" ? "自動" : "手動"}・{formatTokens(pre_tokens)}
          {post_tokens !== undefined && ` → ${formatTokens(post_tokens)}`} トークン）
        </div>
      );
    }
    default:
      return null;
  }
}
