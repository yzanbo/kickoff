import { WifiOff } from "lucide-react";
import type { ApiRetryInfo, ReconnectState } from "../../../../core/types";
import { api } from "../../api";
import { useTicker } from "../../hooks/useTicker";
import { reportFailure } from "../../runActions";

/** 通信の様子（AI の API への再試行中・止まってつながるのを待っているところ） */
export interface Connection {
  retry: ApiRetryInfo | null;
  reconnect: ReconnectState | null;
}

/** 再試行中の文（「接続が切れています。再試行 3/10・あと 8 秒」）。残りの秒数を数える */
export function RetryLabel({ retry }: { retry: ApiRetryInfo }) {
  useTicker(1000);
  const left = Math.ceil((new Date(retry.at).getTime() + retry.retry_delay_ms - Date.now()) / 1000);
  return (
    <>
      接続が切れています。再試行 {retry.attempt}/{retry.max_retries}
      {left > 0 ? `・あと ${left} 秒` : "・送り直しています"}
    </>
  );
}

/** つながるのを待っている間の文 */
export function reconnectLabel(reconnect: ReconnectState): string {
  return reconnect.attempts === 0
    ? "通信が切れて止まりました。つながったら自動で再開します"
    : `通信が切れて止まりました。つながったら自動で再開します（${reconnect.attempts}/${reconnect.max} 回再開済み）`;
}

/**
 * 流れのいちばん下に出す、つながるのを待っている行（作業中の行の代わり）。
 * 「自動で再開しない」で待つのをやめられる（そのあとは、自分でメッセージを送ると続きから再開する）
 */
export function ReconnectRow({ runId, reconnect }: { runId: number; reconnect: ReconnectState }) {
  return (
    <div className="reconnect-row" role="status">
      <WifiOff size={14} aria-hidden />
      <span>{reconnectLabel(reconnect)}</span>
      <button
        type="button"
        className="link-button"
        title="つながっても自動で再開しない（自分でメッセージを送ると、続きから再開します）"
        onClick={() => void api.stopReconnect(runId).catch(reportFailure("自動の再開をやめられませんでした"))}
      >
        自動で再開しない
      </button>
    </div>
  );
}
