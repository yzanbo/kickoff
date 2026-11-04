import { WifiOff } from "lucide-react";
import type { ApiRetryInfo, ReconnectState } from "@shared/types";
import { api } from "@/api";
import { useTicker } from "@/hooks/useTicker";
import { reportFailure } from "@/features/chat/chatActions";

/** 通信の様子（AI の API への再試行中・止まってつながるのを待っているところ） */
export interface Connection {
  retry: ApiRetryInfo | null;
  reconnect: ReconnectState | null;
}

/** 再試行中の文（「接続が切れています。再試行 3/10・あと 8 秒」）。残りの秒数を数える */
export function RetryLabel({ retry, agents = 0 }: { retry: ApiRetryInfo; agents?: number }) {
  useTicker(1000);
  const left = Math.ceil((new Date(retry.at).getTime() + retry.retry_delay_ms - Date.now()) / 1000);
  return (
    <>
      接続が切れています。再試行 {retry.attempt}/{retry.max_retries}
      {left > 0 ? `・あと ${left} 秒` : "・送り直しています"}
      {/* 通信が切れると、サブエージェントは再試行せずにすぐ止まることがある（止まったら一覧に「通信の切断で中断」と出る） */}
      {agents > 0 && `（動いていたサブエージェント ${agents} 件も止まっている可能性があります）`}
    </>
  );
}

/** つながるのを待っている間の文（通信で止まったサブエージェントがあれば、それも続きから再開することを添える） */
export function reconnectLabel(reconnect: ReconnectState): string {
  const base =
    reconnect.attempts === 0
      ? "通信が切れて止まりました。つながったら自動で再開します"
      : `通信が切れて止まりました。つながったら自動で再開します（${reconnect.attempts}/${reconnect.max} 回再開済み）`;
  // 以前のコアは agents を返さない
  const agents = reconnect.agents ?? [];
  return agents.length > 0 ? `${base}。通信で止まったサブエージェント ${agents.length} 件（${agents.join("、")}）も続きから再開します` : base;
}

/**
 * 流れのいちばん下に出す、つながるのを待っている行（作業中の行の代わり）。
 * 「自動で再開しない」で待つのをやめられる（そのあとは、自分でメッセージを送ると続きから再開する）
 */
export function ReconnectRow({ chatId, reconnect }: { chatId: number; reconnect: ReconnectState }) {
  return (
    <div className="reconnect-row" role="status">
      <WifiOff size={14} aria-hidden />
      <span>{reconnectLabel(reconnect)}</span>
      <button
        type="button"
        className="link-button"
        title="つながっても自動で再開しない（自分でメッセージを送ると、続きから再開します）"
        onClick={() => void api.stopReconnect(chatId).catch(reportFailure("自動の再開をやめられませんでした"))}
      >
        自動で再開しない
      </button>
    </div>
  );
}
