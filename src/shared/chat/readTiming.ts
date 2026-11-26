// 未読・既読の切り替えの決まり（コア・画面・スマホで同じ。Node・DOM を読まない）。
// 未読・既読は作業が終わってからだけの状態なので、作業中・回答待ちの間は切り替えない
import type { ChatEvent } from "./chatEvent";
import { isUnreadEvent } from "./state";
import type { AgentState, Chat } from "./types";

/**
 * 既読にするタイミング（全体で 1 つ。設定のチャットの欄）:
 * at_bottom = 一番下まで見たら既読（一番下が見えていて、自分で操作したとき）/ button = 一番下まで見て、ボタンで既読（自動では既読にしない）
 */
export const READ_TIMINGS = ["at_bottom", "button"] as const;
export type ReadTiming = (typeof READ_TIMINGS)[number];

export const READ_TIMING_LABELS: Record<ReadTiming, string> = {
  at_bottom: "一番下まで見たら既読",
  button: "一番下まで見て、ボタンで既読",
};

/** 既読⇔未読の切り替えの向き（seen = 既読にする・unseen = 未読にする） */
export type ReadToggle = "seen" | "unseen";

export const READ_TOGGLE_LABELS: Record<ReadToggle, string> = {
  seen: "既読にする",
  unseen: "未読にする",
};

/** 作業中・回答待ちで切り替えられないときの説明（パソコンの画面・スマホで同じ） */
export const READ_TOGGLE_BUSY_NOTE = "作業中・回答待ちの間は、未読・既読を変えられません";

/**
 * いまの状態から切り替える向き（作業中・回答待ちは null = 切り替えない）。
 * 失敗したものは見るまで未読と同じ扱い（agentStateOf が未読の印のある失敗だけを failed にする）なので、既読にする
 */
export function readToggleOf(state: AgentState): ReadToggle | null {
  if (state === "unread" || state === "failed") return "seen";
  if (state === "read") return "unseen";
  return null;
}

/** ボタンで既読にする設定で、一番下まで来たときに既読ボタンを出すか（作業が終わって未読のときだけ。パソコンとスマホで同じ） */
export const showsReadButton = (timing: ReadTiming, state: AgentState, atBottom: boolean): boolean => timing === "button" && atBottom && readToggleOf(state) === "seen";

/**
 * 一番下まで見たら既読にする設定で、一番下が見えている間に自分で見たときに送る「見た」（送らないなら null）。
 * 手で未読にした覚え（held）がある間は送らない。未読の印がなく、前に送った新しい結果（sentUpTo）より新しい結果もなければ送らない
 * （同じ結果で何度も送らない）。eventId は見た所までの記録で、コアはそれより新しい返答があれば未読のまま残す。
 * upTo は送ったあとに覚える「送った新しい結果」。パソコン（useMarkSeen）とスマホ（useReadState）が同じこの関数で決める
 */
export function seenToSend(input: { timing: ReadTiming; chat: Pick<Chat, "unread">; events: readonly ChatEvent[]; held: boolean; sentUpTo: number }): { upTo: number; eventId: number } | null {
  if (input.timing !== "at_bottom" || input.held) return null;
  const upTo = input.events.findLast(isUnreadEvent)?.id ?? 0;
  if (!input.chat.unread && upTo <= input.sentUpTo) return null;
  return { upTo, eventId: input.events.at(-1)?.id ?? 0 };
}

/**
 * 見ている最中に手で未読にしたチャットの覚え（一番下まで見たら既読にする設定で、同じ画面にいる間は既読に戻さないため）。
 * 未読にしたときの「最後に動いた時刻」と一緒に覚え、時刻が進んだら（返信を送って作業が始まった = 状態が変わった）覚えは効かない。
 * 画面に開き直したときと、手で既読にしたときに外す（パソコンはウィンドウに 1 つ、スマホは画面ごとに 1 つ）
 */
export function createReadHolds() {
  const held = new Map<number, string>();
  return {
    hold: (chat: Pick<Chat, "id" | "active_at">) => void held.set(chat.id, chat.active_at),
    release: (chatId: number) => void held.delete(chatId),
    isHeld: (chat: Pick<Chat, "id" | "active_at">): boolean => held.get(chat.id) === chat.active_at,
  };
}
