import { CornerDownRight, Inbox, Play, RotateCcw, Square } from "lucide-react";
import type { SubagentEntry } from "@shared/chat/subagents";
import { api } from "@/api";
import { confirmDialog } from "@/ui/dialogs";
import { reportFailure } from "@/features/chat/chatActions";
import { cx } from "@/lib/cx";
import { activityOf } from "@/features/chat/status/stall";
import { isSubagentHalted } from "./subagentList";
import { HAND_OVER_NOW, resumeRequest, retryRequest } from "./subagentRelay";

/**
 * サブエージェントの行・タブの見出しの操作。実行中なのに長く動きがないものは「止める」（Claude Code の stopTask。作業中だけ。
 * 止めると中断になり、そこから再開・やり直すができる）。
 * 止まった（失敗・中断）ものは戻すボタン。Kickoff からサブエージェントへは直接送れないので、
 * メインのエージェントに頼む: 再開 = SendMessage で止まったところから続ける / やり直す = 同じ依頼で新しく立ち上げ直す。
 * メインが作業中なら止めずに伝え、作業中でなければすぐ送る（tell の API が決める）
 */
export function SubagentActions({
  chatId,
  entry,
  busy,
  className,
  onOpen,
}: {
  chatId: number;
  entry: SubagentEntry;
  busy: boolean;
  className?: string;
  /** ほかのサブエージェントの中身を開く（やり直した回へ移る。行のキーを渡す） */
  onOpen?: (key: string) => void;
}) {
  if (entry.status === "running") {
    const stalled = busy && entry.agentId && activityOf(entry.lastActivityAt).level === "stalled";
    return stalled ? <StopStalled chatId={chatId} entry={entry} agentId={entry.agentId!} className={className} /> : null;
  }
  // 報告を送ったのに親に届かなかった: 次の指示に添えて渡すが、待たずにいま渡すこともできる（本文はコアが添える）
  if (entry.status === "completed" && entry.delivery === "lost" && entry.undeliveredReport) {
    return (
      <span className={cx("subagent-recovery", className)}>
        <button
          type="button"
          className="btn"
          title="次の指示を待たずに、届いていなかった報告をメインのエージェントにいま渡します（渡さなくても、次に送る指示に自動で添えます）"
          onClick={(e) => {
            e.stopPropagation();
            void api.tellChat(chatId, HAND_OVER_NOW, {}).catch(reportFailure("報告を渡せませんでした"));
          }}
        >
          <Inbox size={12} aria-hidden />
          いま親に渡す
        </button>
        <span className="subagent-recovery-note">次に送る指示にも自動で添えます</span>
      </span>
    );
  }
  // 止まったあと、親が新しいサブエージェントでやり直したもの: 再開・やり直すは仕事が重なるので出さず、やり直した回へ案内する
  const next = entry.supersededBy;
  if (next) {
    return onOpen ? (
      <span className={cx("subagent-recovery", className)}>
        <button
          type="button"
          className="btn"
          title={`親のエージェントが「${next.description}」としてやり直しています。その中身を開きます`}
          onClick={(e) => (e.stopPropagation(), onOpen(next.key))}
        >
          <CornerDownRight size={12} aria-hidden />
          やり直した回を見る
        </button>
      </span>
    ) : null;
  }
  if (!isSubagentHalted(entry)) return null;
  const send = (text: string, failure: string) => api.tellChat(chatId, text, {}).catch(reportFailure(failure));
  const resume = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (entry.agentId) void send(resumeRequest(entry.agentId, entry.description, { outputLimit: entry.outputLimit }), "再開を頼めませんでした");
  };
  const retry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirmDialog({
      title: `「${entry.description}」をやり直しますか？`,
      message: "同じ依頼で、新しいサブエージェントを最初から動かします（前の回の続きはしません）。途中まで進めた作業を続けるなら「再開」を使ってください。",
      confirmLabel: "やり直す",
    });
    if (ok) void send(retryRequest(entry), "やり直しを頼めませんでした");
  };
  return (
    <span className={cx("subagent-recovery", className)}>
      {entry.agentId && (
        <button type="button" className="btn" title="止まったところから続けるよう、メインのエージェントに頼みます" onClick={resume}>
          <Play size={12} aria-hidden />
          再開
        </button>
      )}
      <button type="button" className="btn" title="同じ依頼で最初から立ち上げ直すよう、メインのエージェントに頼みます" onClick={(e) => void retry(e)}>
        <RotateCcw size={12} aria-hidden />
        やり直す
      </button>
    </span>
  );
}

/** 長く動きのないサブエージェントを止める（報告は届かなくなるので確かめる。止めたら一覧の「再開」「やり直す」で戻せる） */
function StopStalled({ chatId, entry, agentId, className }: { chatId: number; entry: SubagentEntry; agentId: string; className?: string }) {
  const stop = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirmDialog({
      title: `サブエージェント「${entry.description}」を止めます`,
      message: "長く動きがありません。止めると、このサブエージェントの報告は届きません。止めたあとは「再開」で続きから、「やり直す」で最初から戻せます。ほかの作業とチャットは止まりません。",
      confirmLabel: "止める",
      danger: true,
    });
    if (ok) await api.stopBackgroundTask(chatId, agentId).catch(reportFailure("サブエージェントを止められませんでした"));
  };
  return (
    <span className={cx("subagent-recovery", className)}>
      <button type="button" className="btn" title="長く動きのないこのサブエージェントだけを止めます（チャットは止めない）" onClick={(e) => void stop(e)}>
        <Square size={12} aria-hidden />
        止める
      </button>
    </span>
  );
}
