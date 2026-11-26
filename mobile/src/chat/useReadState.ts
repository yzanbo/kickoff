// チャットの未読・既読（パソコンと同じ設定「既読にするタイミング」に従う）。作業が終わったら見ていても未読のまま残し、既読にするのは利用者が見たとき・押したときだけ。
// 一番下まで見たら既読: 一番下が見えている間にスクロールし終えた・触ったとき（開いただけ・届いただけ・アプリに戻っただけでは既読にしない）。
// ボタンで既読: 一番下まで来たら既読ボタンを出す（既読なら既読の表示）。どちらも返信を送ると本体が未読を消す
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useFocusEffect } from "expo-router";
import type { ChatEvent } from "@shared/chat/chatEvent";
import { createReadHolds, READ_TOGGLE_BUSY_NOTE, READ_TOGGLE_LABELS, readPillOf, readToggleOf, seenToSend, type ReadTiming, type ReadToggle } from "@shared/chat/readTiming";
import { chatSettings } from "@shared/chat/settings";
import { agentStateOf } from "@shared/chat/state";
import type { Chat } from "@shared/chat/types";
import type { HostSession } from "../state/hostSession";

/** 一番下と見なす余白（逆さの一覧なので、上からのずれ = 一番下からの距離） */
const BOTTOM_SLACK = 80;
/** 本体の設定を読めないとき（設定の口がない古い本体）の既読にするタイミング */
const DEFAULT_TIMING = chatSettings.read_timing.default;

export function useReadState(session: HostSession | null, chat: Chat | null, events: ChatEvent[], hasApproval: boolean) {
  const chatId = chat?.id ?? null;
  const [timing, setTiming] = useState<ReadTiming>(DEFAULT_TIMING);
  const [atBottom, setAtBottom] = useState(true);
  // 見たと送った「新しい結果」の id と、この画面で手で未読にした覚え（同じ画面にいる間は既読に戻さない）
  const sentUpTo = useRef(0);
  const holds = useRef(createReadHolds()).current;
  // 自分で動かし始めたスクロールか（一覧は中身が増えた・描き直したときにも自分でスクロールの終わりを知らせるので、指で動かしたものだけを数える）
  const dragging = useRef(false);
  const latest = useRef({ session, chat, events, timing, atBottom });
  latest.current = { session, chat, events, timing, atBottom };

  // 設定は開くたびに読む（古い本体にはないので、なければ一番下まで見たら既読）
  useEffect(() => {
    if (!session || chatId === null) return;
    void session.client
      .api("GET /api/chat-settings")
      .then((s) => setTiming(s.read_timing))
      .catch(() => setTiming(DEFAULT_TIMING));
  }, [session, chatId]);

  /** 一番下が見えていて、まだ見たと送っていない結果があれば既読にする（確かめるときにいまの値を読む） */
  const check = useCallback(() => {
    const { session: s, chat: c, events: list, timing: t, atBottom: bottom } = latest.current;
    if (!s || !c || !bottom || AppState.currentState !== "active") return;
    const send = seenToSend({ timing: t, chat: c, events: list, held: holds.isHeld(c), sentUpTo: sentUpTo.current });
    if (!send) return;
    sentUpTo.current = send.upTo;
    void s.client.api("POST /api/chats/:chatId/seen", { params: { chatId: c.id }, body: { event_id: send.eventId } }).catch(() => {});
  }, [holds]);

  // 開いた・この画面に戻ってきたとき: 手で未読にした覚えを外す。開いただけでは既読にしない
  // （スマホは開くと一番下から出るので、開いただけで既読にすると、終わった結果を見ないまま既読になる。最初に触ったときに既読にする）
  useFocusEffect(
    useCallback(() => {
      if (chatId !== null) holds.release(chatId);
    }, [holds, chatId]),
  );

  const state = chat ? agentStateOf(chat, hasApproval) : null;
  const toggle = state ? readToggleOf(state) : null;

  /** 手で既読にする・未読にする（長押しのメニュー・既読ボタン） */
  const setRead = useCallback(
    (to: ReadToggle) => {
      const { session: s, chat: c } = latest.current;
      if (!s || !c) return;
      if (to === "unseen") holds.hold(c);
      else holds.release(c.id);
      const path = to === "seen" ? "POST /api/chats/:chatId/seen" : "POST /api/chats/:chatId/unseen";
      void s.client.api(path, { params: { chatId: c.id } }).catch((e: unknown) => {
        holds.release(c.id);
        Alert.alert("未読・既読を変えられませんでした", e instanceof Error ? e.message : String(e));
      });
    },
    [holds],
  );

  return {
    /** ボタンで既読にする設定で、一番下まで来たときに出すもの（未読なら既読ボタン・既読なら既読の表示） */
    readPill: state === null ? null : readPillOf(timing, state, atBottom),
    markSeen: () => setRead("seen"),
    /** 見出しの長押し: 状態に合わせて「未読にする」か「既読にする」（作業中・回答待ちは変えられないと知らせる） */
    openMenu: () => {
      if (!toggle) return Alert.alert("未読・既読", READ_TOGGLE_BUSY_NOTE);
      Alert.alert(chat?.title ?? "チャット", undefined, [
        { text: "やめる", style: "cancel" },
        { text: READ_TOGGLE_LABELS[toggle], onPress: () => setRead(toggle) },
      ]);
    },
    /** 一覧のスクロール（一番下にいるかを覚える） */
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const bottom = e.nativeEvent.contentOffset.y < BOTTOM_SLACK;
      if (bottom !== latest.current.atBottom) setAtBottom(bottom);
    },
    /** 指でスクロールし始めた */
    onDragStart: () => {
      dragging.current = true;
    },
    /** 指を離した: 一番下なら既読にする（位置が覚え直されてから確かめる。勢いで動き続けるときは止まったときにもう一度） */
    onDragEnd: () => {
      if (dragging.current) setTimeout(check, 0);
    },
    /** 指で動かした勢いのスクロールが止まった */
    onMomentumEnd: () => {
      if (!dragging.current) return;
      dragging.current = false;
      setTimeout(check, 0);
    },
    /** 触った: 一番下なら既読にする */
    onTouch: () => setTimeout(check, 0),
  };
}
