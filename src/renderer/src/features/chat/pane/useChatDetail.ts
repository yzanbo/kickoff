import { useEffect, useRef, useState } from "react";
import type { ApiRetryInfo, Approval, BackgroundState, Project, QueuedMessage, ReconnectState, Chat, ChatEvent } from "@shared/types";
import { api } from "@/api";
import { errorMessage } from "@shared/errors";
import { useServerEvent } from "@/api/events";

/**
 * チャットの中身（チャット・プロジェクト・イベント・確認・待ちの列・生成中の返答）を取り、サーバーのイベントで追いかける。
 * チャットを切り替えると読み直す（run が undefined の間は読み込み中。error は読み込みの失敗）
 */
export function useChatDetail(chatId: number, projectId: number) {
  const [chat, setChat] = useState<Chat>();
  const [project, setProject] = useState<Project>();
  const [events, setEvents] = useState<ChatEvent[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  // 作業中に送った、次の指示の待ちの列
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  // 待ちの列を、終わっても自動で送らずに止めておくか
  const [queuePaused, setQueuePaused] = useState(false);
  // 一時停止の位置（0 = 1 件目の上、n = n 件目のあと）
  const [queueStops, setQueueStops] = useState<number[]>([]);
  // 次の指示の書き直しが終わるのを待っている（作業は終わり、送信の準備ができている）
  const [queueWaitingEdit, setQueueWaitingEdit] = useState(false);
  // AI の API への通信を再試行しているところ（通信が切れたときなど）と、止まってつながるのを待っているところ
  const [retry, setRetry] = useState<ApiRetryInfo | null>(null);
  const [reconnect, setReconnect] = useState<ReconnectState | null>(null);
  // 裏で動いている作業と、メインの返答が終わったか（作業中でなければ null）
  const [background, setBackground] = useState<BackgroundState | null>(null);
  // 停止を頼んで、作業が終わるのを待っているか（サブエージェント・裏のコマンドごと終わるまで数秒かかる）
  const [stopping, setStopping] = useState(false);
  // 会話を圧縮している最中なら、始めた時刻（手で圧縮したときも、上限に近づいて自動で圧縮されたときも）
  const [compacting, setCompacting] = useState<string | null>(null);
  // 生成中の返答（確定すると text イベントとして届くので、そこで消す）
  const [live, setLive] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    // 切り替えを素早く繰り返しても、前のチャットの応答で上書きされないように（useBoardChats と同じ alive の形）
    let alive = true;
    setChat(undefined);
    setEvents([]);
    setQueue([]);
    setQueuePaused(false);
    setQueueStops([]);
    setQueueWaitingEdit(false);
    setRetry(null);
    setReconnect(null);
    setBackground(null);
    setStopping(false);
    setCompacting(null);
    setLive("");
    setError(undefined);
    api
      .run(chatId)
      .then((d) => {
        if (!alive) return;
        setChat(d.chat);
        setEvents(d.events);
        setApprovals(d.approvals);
        setQueue(d.queue ?? []);
        setQueuePaused(Boolean(d.queue_paused));
        setQueueStops(d.queue_stops ?? []);
        setQueueWaitingEdit(Boolean(d.queue_waiting_edit));
        setReconnect(d.reconnect ?? null);
        setBackground(d.background ?? null);
        setStopping(Boolean(d.stopping));
        setCompacting(d.compacting ?? null);
      })
      .catch((e: unknown) => alive && setError(errorMessage(e)));
    api
      .project(projectId)
      .then((p) => alive && setProject(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [chatId, projectId]);

  // 書いている途中の返答は、細切れ（トークンごと）に届く。届くたびに描き直すと、長いチャットでは流れの描き直しが追いつかず
  // 入力が重くなるので、1 フレームの間に届いた分をまとめて足す
  const pendingDelta = useRef("");
  const deltaFrame = useRef<number | null>(null);
  const dropPendingDelta = () => {
    if (deltaFrame.current !== null) cancelAnimationFrame(deltaFrame.current);
    deltaFrame.current = null;
    pendingDelta.current = "";
  };
  useEffect(() => dropPendingDelta, [chatId]);

  useServerEvent((e) => {
    if (e.type === "chat_delta" && e.chat_id === chatId) {
      pendingDelta.current += e.text;
      deltaFrame.current ??= requestAnimationFrame(() => {
        const text = pendingDelta.current;
        deltaFrame.current = null;
        pendingDelta.current = "";
        setLive((prev) => prev + text);
        setRetry(null);
      });
    } else if (e.type === "chat_event" && e.event.chat_id === chatId) {
      setEvents((prev) => (prev.some((x) => x.id === e.event.id) ? prev : [...prev, e.event]));
      if (e.event.type !== "user") {
        dropPendingDelta();
        setLive("");
      }
    } else if (e.type === "chat_events_deleted" && e.chat_id === chatId) {
      // 巻き戻した: その発言から後ろを画面の記録からも消す
      setEvents((prev) => prev.filter((x) => x.id < e.from_event_id));
      dropPendingDelta();
      setLive("");
    } else if (e.type === "chat" && e.chat.id === chatId) {
      setChat(e.chat);
      if (e.chat.status !== "running") {
        dropPendingDelta();
        setLive("");
        setRetry(null);
        setCompacting(null);
      }
    } else if (e.type === "chat_retry" && e.chat_id === chatId) {
      setRetry(e.retry);
    } else if (e.type === "chat_reconnect" && e.chat_id === chatId) {
      setReconnect(e.reconnect);
    } else if (e.type === "chat_background" && e.chat_id === chatId) {
      setBackground(e.background);
    } else if (e.type === "chat_compacting" && e.chat_id === chatId) {
      setCompacting(e.since);
    } else if (e.type === "chat_stopping" && e.chat_id === chatId) {
      setStopping(e.stopping);
    } else if (e.type === "chat_queue" && e.chat_id === chatId) {
      setQueue(e.queue);
      setQueuePaused(e.paused);
      setQueueStops(e.stops);
      setQueueWaitingEdit(Boolean(e.waiting_edit));
    } else if (e.type === "approval" && e.approval.chat_id === chatId) {
      setApprovals((prev) => [...prev, e.approval]);
    } else if (e.type === "approval_resolved" && e.chat_id === chatId) {
      setApprovals((prev) => prev.filter((a) => a.id !== e.id));
    }
  });

  return { chat, project, events, approvals, queue, queuePaused, queueStops, queueWaitingEdit, retry, reconnect, background, stopping, compacting, live, error };
}
