import { Play, RotateCcw } from "lucide-react";
import type { SubagentEntry } from "../../../../core/subagents";
import { api } from "../../api";
import { confirmDialog } from "../../dialogs";
import { reportFailure } from "../../runActions";
import { cx } from "../../cx";
import { isSubagentHalted } from "./subagentList";
import { resumeRequest, retryRequest } from "./subagentRelay";

/**
 * 止まった（失敗・中断）サブエージェントを戻すボタン（一覧の行とタブの見出し）。Kickoff からサブエージェントへは直接送れないので、
 * メインのエージェントに頼む: 再開 = SendMessage で止まったところから続ける / やり直す = 同じ依頼で新しく立ち上げ直す。
 * メインが作業中なら止めずに伝え、作業中でなければすぐ送る（tell の API が決める）
 */
export function SubagentRecovery({ runId, entry, className }: { runId: number; entry: SubagentEntry; className?: string }) {
  if (!isSubagentHalted(entry)) return null;
  const send = (text: string, failure: string) => api.tellRun(runId, text, {}).catch(reportFailure(failure));
  const resume = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (entry.agentId) void send(resumeRequest(entry.agentId, entry.description), "再開を頼めませんでした");
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
        <button type="button" className="btn small" title="止まったところから続けるよう、メインのエージェントに頼みます" onClick={resume}>
          <Play size={12} aria-hidden />
          再開
        </button>
      )}
      <button type="button" className="btn small" title="同じ依頼で最初から立ち上げ直すよう、メインのエージェントに頼みます" onClick={(e) => void retry(e)}>
        <RotateCcw size={12} aria-hidden />
        やり直す
      </button>
    </span>
  );
}
