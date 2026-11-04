import { useEffect, useRef, useState } from "react";
import type { Approval, Project, Chat, ChatEvent, ChatLive } from "@shared/types";
import { api } from "@/api";
import { errorMessage } from "@shared/errors";
import { useServerEvent } from "@/api/events";

/** 読み込む前・何も起きていないときの作業中の様子 */
const IDLE_LIVE: ChatLive = {
  queue: { messages: [], paused: false, stops: [], waiting_edit: false },
  background: null,
  retry: null,
  reconnect: null,
  compacting: null,
  stopping: false,
};

/**
 * 届いた作業中の様子のうち、中身の変わっていないものは前のものを使う（chat_live はどれかが変わるたびに丸ごと届くので、
 * 裏の作業などを見て記録をたどる計算（useSubagents など）を、変わっていないのにやり直さないため）
 */
function keepUnchanged(prev: ChatLive, next: ChatLive): ChatLive {
  const keep = <T,>(a: T, b: T): T => (JSON.stringify(a) === JSON.stringify(b) ? a : b);
  return {
    queue: keep(prev.queue, next.queue),
    background: keep(prev.background, next.background),
    retry: keep(prev.retry, next.retry),
    reconnect: keep(prev.reconnect, next.reconnect),
    compacting: next.compacting,
    stopping: next.stopping,
  };
}

/**
 * チャットの中身（チャット・プロジェクト・イベント・確認・作業中の様子・書いている途中の返答）を取り、サーバーのイベントで追いかける。
 * 作業中の様子（送信待ち・裏の作業・再試行・再接続待ち・圧縮中・停止中）はコアが持つ形（ChatLive）のまま受け、SSE の chat_live で丸ごと置き換える。
 * チャットを切り替えると読み直す（chat が undefined の間は読み込み中。error は読み込みの失敗）
 */
export function useChatDetail(chatId: number, projectId: number) {
  const [chat, setChat] = useState<Chat>();
  const [project, setProject] = useState<Project>();
  const [events, setEvents] = useState<ChatEvent[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [live, setLive] = useState<ChatLive>(IDLE_LIVE);
  // 書いている途中の返答（確定すると text イベントとして届くので、そこで消す）
  const [streaming, setStreaming] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    // 切り替えを素早く繰り返しても、前のチャットの応答で上書きされないように（useBoardChats と同じ alive の形）
    let alive = true;
    setChat(undefined);
    setEvents([]);
    setLive(IDLE_LIVE);
    setStreaming("");
    setError(undefined);
    api
      .chatDetail(chatId)
      .then((d) => {
        if (!alive) return;
        setChat(d.chat);
        setEvents(d.events);
        setApprovals(d.approvals);
        setLive(d.live);
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
  /** 書いている途中の返答を消す（確定した・巻き戻した・作業が終わった） */
  const clearStreaming = () => {
    dropPendingDelta();
    setStreaming("");
  };

  useServerEvent((e) => {
    if (e.type === "chat_delta" && e.chat_id === chatId) {
      pendingDelta.current += e.text;
      deltaFrame.current ??= requestAnimationFrame(() => {
        const text = pendingDelta.current;
        deltaFrame.current = null;
        pendingDelta.current = "";
        setStreaming((prev) => prev + text);
      });
    } else if (e.type === "chat_event" && e.event.chat_id === chatId) {
      setEvents((prev) => (prev.some((x) => x.id === e.event.id) ? prev : [...prev, e.event]));
      if (e.event.type !== "user") clearStreaming();
    } else if (e.type === "chat_events_deleted" && e.chat_id === chatId) {
      // 巻き戻した: その発言から後ろを画面の記録からも消す
      setEvents((prev) => prev.filter((x) => x.id < e.from_event_id));
      clearStreaming();
    } else if (e.type === "chat" && e.chat.id === chatId) {
      setChat(e.chat);
      if (e.chat.status !== "running") clearStreaming();
    } else if (e.type === "chat_live" && e.chat_id === chatId) {
      setLive((prev) => keepUnchanged(prev, e.live));
    } else if (e.type === "approval" && e.approval.chat_id === chatId) {
      setApprovals((prev) => [...prev, e.approval]);
    } else if (e.type === "approval_resolved" && e.chat_id === chatId) {
      setApprovals((prev) => prev.filter((a) => a.id !== e.id));
    }
  });

  return { chat, project, events, approvals, live, streaming, error };
}
