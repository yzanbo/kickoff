// チャットの未読・既読（パソコンと同じ設定「既読にするタイミング」に従う）。作業が終わったら見ていても未読のまま残し、既読にするのは利用者が見たとき・押したときだけ。
// 一番下まで見たら既読: 一番下が見えている間に開いた・スクロールし終えた・触ったとき（届いただけ・アプリに戻っただけでは既読にしない = パソコンの useMarkSeen と同じ）。
// ボタンで既読: 一番下まで来たら既読ボタンを出す。どちらも返信を送ると本体が未読を消す
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useFocusEffect } from "expo-router";
import type { ChatEvent } from "@shared/chat/chatEvent";
import { READ_TOGGLE_BUSY_NOTE, READ_TOGGLE_LABELS, readToggleOf, showsReadButton, type ReadTiming, type ReadToggle } from "@shared/chat/readTiming";
import { agentStateOf, isUnreadEvent } from "@shared/chat/state";
import type { Chat } from "@shared/chat/types";
import type { HostSession } from "../state/hostSession";

/** 一番下と見なす余白（逆さの一覧なので、上からのずれ = 一番下からの距離） */
const BOTTOM_SLACK = 80;

export function useReadState(session: HostSession | null, chat: Chat | null, events: ChatEvent[], hasApproval: boolean) {
  const chatId = chat?.id ?? null;
  const [timing, setTiming] = useState<ReadTiming>("at_bottom");
  const [atBottom, setAtBottom] = useState(true);
  // 見たと送った「新しい結果」の id（同じ結果で何度も送らない）と、この画面で手で未読にしたときの「最後に動いた時刻」
  // （一番下まで見たら既読にする設定で、同じ画面にいる間は既読に戻さない。返信して作業が始まると時刻が進み、効かなくなる）
  const sentUpTo = useRef(0);
  const heldAt = useRef<string | null>(null);
  const latest = useRef({ session, chat, events, timing, atBottom });
  latest.current = { session, chat, events, timing, atBottom };

  // 設定は開くたびに読む（古い本体にはないので、なければ一番下まで見たら既読）
  useEffect(() => {
    if (!session || chatId === null) return;
    void session.client
      .api("GET /api/chat-settings")
      .then((s) => setTiming(s.read_timing))
      .catch(() => setTiming("at_bottom"));
  }, [session, chatId]);

  /** 一番下が見えていて、まだ見たと送っていない結果があれば既読にする（確かめるときにいまの値を読む） */
  const check = useCallback(() => {
    const { session: s, chat: c, events: list, timing: t, atBottom: bottom } = latest.current;
    if (!s || !c || t !== "at_bottom" || !bottom || AppState.currentState !== "active") return;
    if (heldAt.current === c.active_at) return;
    const lastUnreadId = list.findLast(isUnreadEvent)?.id ?? 0;
    if (!c.unread && lastUnreadId <= sentUpTo.current) return;
    sentUpTo.current = lastUnreadId;
    // 見た所までの記録の id を渡す（それより新しい返答が届いていれば、本体が未読のまま残す）
    const last = list.at(-1)?.id;
    void s.client.api("POST /api/chats/:chatId/seen", { params: { chatId: c.id }, body: last === undefined ? {} : { event_id: last } }).catch(() => {});
  }, []);

  // 開いた（読めた）・この画面に戻ってきたとき: 手で未読にした覚えを外して確かめる
  const loaded = chat !== null;
  useFocusEffect(
    useCallback(() => {
      heldAt.current = null;
      if (loaded) check();
    }, [loaded, check]),
  );

  const toggle = chat ? readToggleOf(agentStateOf(chat, hasApproval)) : null;

  /** 手で既読にする・未読にする（長押しのメニュー・既読ボタン） */
  const setRead = useCallback(
    (to: ReadToggle) => {
      const { session: s, chat: c } = latest.current;
      if (!s || !c) return;
      heldAt.current = to === "unseen" ? c.active_at : null;
      const path = to === "seen" ? "POST /api/chats/:chatId/seen" : "POST /api/chats/:chatId/unseen";
      void s.client.api(path, { params: { chatId: c.id } }).catch((e: unknown) => {
        heldAt.current = null;
        Alert.alert("未読・既読を変えられませんでした", e instanceof Error ? e.message : String(e));
      });
    },
    [],
  );

  return {
    /** ボタンで既読にする設定で、一番下まで来て未読のとき */
    readButton: chat !== null && showsReadButton(timing, agentStateOf(chat, hasApproval), atBottom),
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
    /** 自分で操作した（スクロールし終えた・触った）: 一番下なら既読にする（位置が覚え直されてから確かめる） */
    onActivity: () => setTimeout(check, 0),
  };
}
