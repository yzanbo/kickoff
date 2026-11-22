// チャットの店のテストの準備（偽の rAF・タイマー・時計・読み込みで作った店と、記録・詳細を作る補助。テストだけが読む）
import type { ChatEvent } from "@shared/chat/chatEvent";
import type { Chat } from "@shared/chat/types";
import type { ChatDetail, ChatDetailQuery, ChatEventPage, ChatEventsQuery } from "@shared/chat/detail";
import { busEvent, makeChat, makeEvent } from "@shared/foundation/testing/factories";
import { settle } from "@shared/foundation/testing/async";
import { createFakeScheduler } from "@shared/foundation/testing/fakeScheduler";
import { EMPTY_DETAIL } from "./chatDetail";
import { createChatStore } from "./chatStore";

/** 偽の rAF・タイマー・時計・読み込みで作った店（テストごとに新しく作る） */
export function setup() {
  let hidden = false;
  const clock = createFakeScheduler();
  const loads: { chatId: number; query: ChatDetailQuery; resolve: (d: ChatDetail) => void; reject: (e: Error) => void }[] = [];
  const pages: { chatId: number; query: ChatEventsQuery; resolve: (p: ChatEventPage) => void; reject: (e: Error) => void }[] = [];
  const store = createChatStore({
    frame: clock.frame,
    idle: clock.idle,
    timer: clock.timer,
    now: clock.now,
    windowHidden: () => hidden,
    load: (chatId, query) => new Promise((resolve, reject) => loads.push({ chatId, query, resolve, reject })),
    page: (chatId, query) => new Promise((resolve, reject) => pages.push({ chatId, query, resolve, reject })),
  });
  /** 口ごとの知らせの回数 */
  const counts = (chatId: number) => {
    const c = { detail: 0, log: 0, progress: 0, streaming: 0 };
    for (const channel of ["detail", "log", "progress", "streaming"] as const) store.subscribe(chatId, channel, () => c[channel]++);
    return c;
  };
  return { store, clock, loads, pages, counts, setHidden: (h: boolean) => (hidden = h) };
}

export const chatOf = (id: number, status: Chat["status"] = "running") => makeChat(id, { status });
export const text = (id: number, chatId = 1, data: { text: string; parent?: string } = { text: `#${id}` }) => makeEvent(id, "text", data, { chat_id: chatId });
export const added = (event: ChatEvent) => busEvent("chat_event", { project_id: 1, event });
export const delta = (t: string, offset: number, chatId = 1) => busEvent("chat_delta", { project_id: 1, chat_id: chatId, text: t, offset });
export const detail = (chat: Chat, events: ChatEvent[] = [], streaming: string | null = null): ChatDetail => ({
  chat,
  events,
  has_earlier: false,
  after_missing: false,
  approvals: [],
  live: EMPTY_DETAIL.live,
  streaming_text: streaming,
  streaming_length: streaming?.length ?? 0,
});

/** チャット 1 を開いて読み込み、開いた直後のため方も終えた店 */
export async function opened(events: ChatEvent[] = [text(1)], streaming: string | null = null) {
  const s = setup();
  const handle = s.store.retain(1, "visible");
  s.loads[0].resolve(detail(chatOf(1), events, streaming));
  await settle();
  s.store.markPainted(1);
  return { ...s, handle };
}

/** 末尾（5〜7）だけを読んで開いた店（前に作業の終わり 2・4 がある） */
export async function openedTail() {
  const s = setup();
  const handle = s.store.retain(1, "visible");
  const result = (id: number) => makeEvent(id, "result", { status: "completed" }, { chat_id: 1 });
  s.loads[0].resolve({ ...detail(chatOf(1, "completed"), [text(5), result(6), text(7)]), has_earlier: true, index: [result(2), result(4)], head_partial: false });
  await settle();
  s.store.markPainted(1);
  return { ...s, handle, result };
}
