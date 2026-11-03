import { useEffect, useState } from "react";
import type { ApiRetryInfo, Approval, BackgroundState, Project, QueuedMessage, ReconnectState, Run, RunEvent } from "../../../../core/types";
import { api } from "../../api";
import { errorMessage } from "../../errors";
import { useServerEvent } from "../../events";
import { BUSY_STATUSES } from "../RunStatus";

/**
 * チャットの中身（チャット・プロジェクト・イベント・確認・待ちの列・生成中の返答）を取り、サーバーのイベントで追いかける。
 * チャットを切り替えると読み直す（run が undefined の間は読み込み中。error は読み込みの失敗）
 */
export function useRunDetail(runId: number, projectId: number) {
  const [run, setRun] = useState<Run>();
  const [project, setProject] = useState<Project>();
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  // 作業中に送った、次の指示の待ちの列
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  // 待ちの列を、終わっても自動で送らずに止めておくか
  const [queuePaused, setQueuePaused] = useState(false);
  // 「ここまで自動で送る」の印を付けた待ちの指示
  const [queueStopAfter, setQueueStopAfter] = useState<string | null>(null);
  // AI の API への通信を再試行しているところ（通信が切れたときなど）と、止まってつながるのを待っているところ
  const [retry, setRetry] = useState<ApiRetryInfo | null>(null);
  const [reconnect, setReconnect] = useState<ReconnectState | null>(null);
  // 裏で動いている作業と、メインの返答が終わったか（作業中でなければ null）
  const [background, setBackground] = useState<BackgroundState | null>(null);
  // 生成中の返答（確定すると text イベントとして届くので、そこで消す）
  const [live, setLive] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    // 切り替えを素早く繰り返しても、前のチャットの応答で上書きされないように（useBoardRuns と同じ alive の形）
    let alive = true;
    setRun(undefined);
    setEvents([]);
    setQueue([]);
    setQueuePaused(false);
    setQueueStopAfter(null);
    setRetry(null);
    setReconnect(null);
    setBackground(null);
    setLive("");
    setError(undefined);
    api
      .run(runId)
      .then((d) => {
        if (!alive) return;
        setRun(d.run);
        setEvents(d.events);
        setApprovals(d.approvals);
        setQueue(d.queue ?? []);
        setQueuePaused(Boolean(d.queue_paused));
        setQueueStopAfter(d.queue_stop_after ?? null);
        setReconnect(d.reconnect ?? null);
        setBackground(d.background ?? null);
      })
      .catch((e: unknown) => alive && setError(errorMessage(e)));
    api
      .project(projectId)
      .then((p) => alive && setProject(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [runId, projectId]);

  useServerEvent((e) => {
    if (e.type === "run_delta" && e.run_id === runId) {
      setLive((prev) => prev + e.text);
      setRetry(null);
    } else if (e.type === "run_event" && e.event.run_id === runId) {
      setEvents((prev) => (prev.some((x) => x.id === e.event.id) ? prev : [...prev, e.event]));
      if (e.event.type !== "user") setLive("");
    } else if (e.type === "run_events_deleted" && e.run_id === runId) {
      // 巻き戻した: その発言から後ろを画面の記録からも消す
      setEvents((prev) => prev.filter((x) => x.id < e.from_event_id));
      setLive("");
    } else if (e.type === "run" && e.run.id === runId) {
      setRun(e.run);
      if (!BUSY_STATUSES.includes(e.run.status)) {
        setLive("");
        setRetry(null);
      }
    } else if (e.type === "run_retry" && e.run_id === runId) {
      setRetry(e.retry);
    } else if (e.type === "run_reconnect" && e.run_id === runId) {
      setReconnect(e.reconnect);
    } else if (e.type === "run_background" && e.run_id === runId) {
      setBackground(e.background);
    } else if (e.type === "run_queue" && e.run_id === runId) {
      setQueue(e.queue);
      setQueuePaused(e.paused);
      setQueueStopAfter(e.stop_after);
    } else if (e.type === "approval" && e.approval.run_id === runId) {
      setApprovals((prev) => [...prev, e.approval]);
    } else if (e.type === "approval_resolved" && e.run_id === runId) {
      setApprovals((prev) => prev.filter((a) => a.id !== e.id));
    }
  });

  return { run, project, events, approvals, queue, queuePaused, queueStopAfter, retry, reconnect, background, live, error };
}
