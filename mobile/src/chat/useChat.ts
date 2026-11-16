// 1 つのチャットの様子（記録・チャット・作業中の様子・回答待ち・書いている途中の返答）。開いたら最後の分だけ読み、さかのぼるときは ?before=、
// つなぎ直したら ?after= で抜けた分だけ取る（巻き戻しで消えていれば読み直す）。見ている間は本体に「見ている」を知らせる（そのチャットの通知は来ない）
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { VIEWING_TTL_MS, type Approval, type Chat, type ChatEvent, type ChatLive } from "@shared/types";
import { streamingAppendOf, streamingEffectOf, type StreamingEffect } from "@shared/chat/streamingRules";
import { applyEventToLog, lastEventId, mergeEvents } from "../lib/timeline";
import type { HostSession } from "../state/hostSession";

const PAGE = 60;

export function useChat(session: HostSession | null, chatId: number) {
  const [chat, setChat] = useState<Chat | null>(null);
  const [events, setEvents] = useState<ChatEvent[]>([]);
  const [live, setLive] = useState<ChatLive | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [hasEarlier, setHasEarlier] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [error, setError] = useState<string | null>(null);
  const eventsRef = useRef(events);
  eventsRef.current = events;
  // 読み込みの最中に届いた、書いている途中の返答への知らせ（読み込み中でなければ null）。読めたら、詳細の書きかけの返答に順に当て直す
  // （詳細の文に入っている分は chat_delta の offset で捨てる。返答の途中で開いても文の頭から出る）
  const streamingReplay = useRef<StreamingEffect[] | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    streamingReplay.current = [];
    try {
      const last = lastEventId(eventsRef.current);
      const detail = await session.client.chatDetail(chatId, last === null ? { limit: PAGE } : { after: last });
      if (detail.after_missing) {
        // 巻き戻しで消えた記録のあとから読もうとした: 読み直す
        const fresh = await session.client.chatDetail(chatId, { limit: PAGE });
        setEvents(fresh.events);
        setHasEarlier(fresh.has_earlier);
      } else if (last === null) {
        setEvents(detail.events);
        setHasEarlier(detail.has_earlier);
      } else setEvents((e) => mergeEvents(e, detail.events));
      // 書いている途中の返答は、詳細の書きかけの返答から始め、読み込みの最中に届いた知らせを当て直す
      const missed = streamingReplay.current ?? [];
      streamingReplay.current = null;
      setStreaming(missed.reduce(applyStreaming, detail.chat.status === "running" ? (detail.streaming_text ?? "") : ""));
      setChat(detail.chat);
      setLive(detail.live);
      setApprovals(detail.approvals);
      setError(null);
      if (detail.chat.unread) void session.client.markSeen(chatId).catch(() => {});
    } catch (e) {
      streamingReplay.current = null;
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [session, chatId]);

  const loadEarlier = useCallback(async () => {
    const first = eventsRef.current[0]?.id;
    if (!session || first === undefined) return;
    const detail = await session.client.chatDetail(chatId, { before: first, limit: PAGE });
    setEvents((e) => mergeEvents(e, detail.events));
    setHasEarlier(detail.has_earlier);
  }, [session, chatId]);

  useEffect(() => {
    if (!session) return;
    if (session.state.kind === "open") void load();
    const offOpen = session.onOpen(() => void load());
    const offEvent = session.onEvent((e) => {
      setEvents((current) => applyEventToLog(current, chatId, e));
      // 書いている途中の返答を足す・消す（パソコンと同じ決まり。サブエージェントの記録・お知らせなどでは消さない）
      const effect = streamingEffectOf(e);
      if (effect?.chatId === chatId) {
        streamingReplay.current?.push(effect);
        setStreaming((s) => applyStreaming(s, effect));
      }
      if (e.type === "chat" && e.chat.id === chatId) {
        setChat(e.chat);
        // 見ている間に終わったら既読にする
        if (e.chat.unread && AppState.currentState === "active") void session.client.markSeen(chatId).catch(() => {});
      }
      if (e.type === "chat_live" && e.chat_id === chatId) setLive(e.live);
      if (e.type === "approval" && e.approval.chat_id === chatId) setApprovals((a) => [...a.filter((x) => x.id !== e.approval.id), e.approval]);
      if (e.type === "approval_resolved" && e.chat_id === chatId) setApprovals((a) => a.filter((x) => x.id !== e.id));
    });
    return () => {
      offOpen();
      offEvent();
    };
  }, [session, chatId, load]);

  // 見ている間（画面が前・アプリが表）は、本体に知らせ続ける（そのチャットの通知を止める）
  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      const report = () => void session.client.reportViewing({ chat_id: AppState.currentState === "active" ? chatId : null, ci_project_id: null }).catch(() => {});
      report();
      const timer = setInterval(report, VIEWING_TTL_MS / 3);
      const sub = AppState.addEventListener("change", report);
      return () => {
        clearInterval(timer);
        sub.remove();
        void session.client.reportViewing({ chat_id: null, ci_project_id: null }).catch(() => {});
      };
    }, [session, chatId]),
  );

  return { chat, events, live, approvals, hasEarlier, streaming, error, loadEarlier, reload: load };
}

/** 書いている途中の返答に知らせを当てる（足すときは、もう持っている所を offset で捨てる） */
function applyStreaming(text: string, effect: StreamingEffect): string {
  return effect.effect === "append" ? text + streamingAppendOf(text.length, effect.text, effect.offset) : "";
}
