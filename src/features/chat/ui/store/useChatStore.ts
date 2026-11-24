import { useEffectEvent, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { Chat } from "@shared/chat/types";
import { chatsApi } from "@/features/chat/ui/api/chats";
import { onServerEvent, onServerOpen } from "@/foundation/ui/api/events";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { CHAT_STORE_EVENTS } from "./chatDetail";
import type { EdgeAsk } from "./chatPaging";
import { createChatStore } from "./chatStore";
import { createSelectorKit } from "./chatSelector";
import { createPrefetchQueue } from "./prefetch";
import { createHoverPrefetch } from "./hoverPrefetch";
import { knownChatsForStore } from "./knownChats";
import { approvalsOf, subscribeApprovals } from "./approvals";
import type { ChatDetailView } from "./chatStoreTypes";

/*
 * アプリで使うチャットの店（1 つだけ）と、口ごとの React の hook。サーバーの知らせの購読と document の見張りは startChatStore
 * （起動のときに app/renderer/main.tsx が 1 回、部品より先に呼ぶ）。テストはこのモジュールを使わず、createChatStore で作った店を試す
 */
function idle(fn: () => void, timeout: number) {
  const id = requestIdleCallback(fn, { timeout });
  return () => cancelIdleCallback(id);
}
function timer(fn: () => void, ms: number) {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
}

const chatStore = createChatStore({
  frame: (fn) => {
    const id = requestAnimationFrame(fn);
    return () => cancelAnimationFrame(id);
  },
  idle,
  timer,
  now: () => Date.now(),
  windowHidden: () => document.visibilityState === "hidden",
  load: (chatId, query) => chatsApi.chatDetail(chatId, query),
  page: (chatId, query) => chatsApi.chatEvents(chatId, query),
  chats: knownChatsForStore,
  approvals: approvalsOf,
});
const prefetchQueue = createPrefetchQueue({ prefetch: (chatId) => chatStore.prefetch(chatId), busy: () => chatStore.busy(), idle, timer });

/** 取り出し口を定義する（計算は持ち主の機能が書く。chatSelector.ts） */
export const defineChatSelector = createSelectorKit(chatStore);

/** サーバーの知らせと回答待ちの店の変化を店に当て、document を見張る（起動のときに 1 回。部品の hook より先に知らせを受ける） */
export function startChatStore(): () => void {
  const offs = [onServerEvent(CHAT_STORE_EVENTS, (event) => chatStore.apply(event)), onServerOpen(() => chatStore.reconnected()), subscribeApprovals(() => chatStore.approvalsChanged())];
  // チャットを開く所（サイドバーの行・ボードのカード・パネルのタブ）に乗せて少し待ったら先読みする（hoverPrefetch.ts）
  const hover = createHoverPrefetch({ timer, prefetch: (chatId) => prefetchQueue.request([chatId]) });
  const over = (e: PointerEvent) => hover.over(e.target instanceof Element ? e.target : null);
  // ウィンドウが表に出たら、ためていた途中の文をすぐ当てる
  const shown = () => {
    if (document.visibilityState === "visible") chatStore.windowShown();
  };
  document.addEventListener("pointerover", over, { passive: true });
  document.addEventListener("visibilitychange", shown);
  return () => {
    offs.forEach((off) => off());
    document.removeEventListener("pointerover", over);
    document.removeEventListener("visibilitychange", shown);
  };
}

/**
 * チャットを見る（描いている間。見る部品のいない中身は店に残り、知らせを当て続ける）。visible はパネルの裏のタブ・閉じたパネルで false
 * （書いている途中の返答を当てる間隔に効く）。読む口より先に、描いたときに頼む
 */
function useChatRetain(chatId: number, visible: boolean) {
  const handle = useRef<ReturnType<typeof chatStore.retain> | null>(null);
  // 頼むときの見え方（変わっても頼み直さない。見え方の変化は下の effect で伝える）
  const visibility = useEffectEvent(() => (visible ? "visible" : "hidden"));
  useLayoutEffect(() => {
    const h = chatStore.retain(chatId, visibility());
    handle.current = h;
    return () => {
      h.release();
      handle.current = null;
    };
  }, [chatId]);
  useLayoutEffect(() => handle.current?.setVisibility(visible ? "visible" : "hidden"), [visible]);
}

/** 口 detail（チャット・回答待ち・作業中の様子・読み込みの失敗） */
export function useChatDetail(chatId: number): ChatDetailView {
  return useSyncExternalStore(
    (l) => chatStore.subscribe(chatId, "detail", l),
    () => chatStore.detail(chatId),
  );
}

/**
 * 記録の読み足し: 前を読む・途中の一部分の後ろを読む（窓の端からは ask を付ける。読んでいる最中・同じ形のままなら頼まず null）・
 * 遠い記録を読む・末尾に戻る・サブエージェントの中を読む・その記録を流れに出しているか
 */
export const chatLog = {
  loadEarlier: (chatId: number, ask?: EdgeAsk) => chatStore.loadEarlier(chatId, ask),
  loadLater: (chatId: number, ask?: EdgeAsk) => chatStore.loadLater(chatId, ask),
  openAround: (chatId: number, eventId: number) => chatStore.openAround(chatId, eventId),
  backToTail: (chatId: number) => chatStore.backToTail(chatId),
  loadScope: (chatId: number, parents: readonly string[], ids?: readonly number[]) => chatStore.loadScope(chatId, parents, ids),
  shows: (chatId: number, eventId: number) => chatStore.shows(chatId, eventId),
};

/**
 * チャットを先読みする（末尾と索引だけ。見る部品は増やさない）。
 * 手すきのときに 1 件ずつ、見ているチャットの読み込み中は待つ。先に書いたものほど先に読む
 */
export const prefetchChats = (chatIds: readonly number[]) => prefetchQueue.request(chatIds);

/** 書いている途中の返答の、その世代の文の読み方と購読の仕方（文は React の state に入れず、少しずつ出す rAF の中で読む） */
export interface StreamingSource {
  read: () => string;
  subscribe: (l: () => void) => () => void;
}

// 同じチャット・世代なら同じ読み方を返す（古い世代の読み方は持ち続けない。書いている途中の返答は 1 チャットに 1 つ）
const sources = new Map<string, StreamingSource>();
function streamingSource(chatId: number, gen: number): StreamingSource {
  const key = `${chatId}:${gen}`;
  let source = sources.get(key);
  if (!source) {
    source = { read: () => chatStore.streamText(chatId, gen), subscribe: (l) => chatStore.subscribe(chatId, "streaming", l) };
    for (const k of sources.keys()) if (k.startsWith(`${chatId}:`)) sources.delete(k);
    sources.set(key, source);
  }
  return source;
}

/**
 * 書いている途中の返答: あるか（書き始め・消したときだけ描き直す）・その世代の文の読み方（StreamingReply が rAF の中で読む）・
 * 最後に届いた時刻（作業中の行の「動きがない」の目安。描くときに読む）。世代は記録の口から選んで読む（消したときだけ変わり、
 * 確定した返答が記録に入る描き直しと同じ 1 回で進む）
 */
export function useStreaming(chatId: number): { active: boolean; source: StreamingSource; lastAt: () => string | null } {
  const gen = useSyncExternalStore(
    (l) => chatStore.subscribe(chatId, "log", l),
    () => chatStore.log(chatId).streamGen,
  );
  const active = useSyncExternalStore(
    (l) => chatStore.subscribe(chatId, "streaming", l),
    () => chatStore.streamText(chatId, gen) !== "",
  );
  return { active, source: streamingSource(chatId, gen), lastAt: () => chatStore.streamLastAt(chatId) };
}

/** 口 detail のチャットだけ（名前・状態などが変わったときだけ描き直す。回答待ち・作業中の様子では描き直さない） */
export function useChatOf(chatId: number): Chat | undefined {
  return useSyncExternalStore(
    (l) => chatStore.subscribe(chatId, "detail", l),
    () => chatStore.detail(chatId).chat,
  );
}

/**
 * チャットを開く（チャットの画面を描く 5 か所: パネルのタブ・右の欄の子チャット・ノートのチャット・子チャットとサブエージェントの別ウィンドウ）。
 * 店に見ることを頼み（retain）、チャット・プロジェクト・読み込みの失敗だけを返す（記録・回答待ち・作業中の様子は読まない。
 * 会話の欄が自分で読むので、隠した会話の欄（Activity）の外の殻は、記録が届くたびに描き直さない）。
 * 中身を描けたら（rAF 2 回）、開いた直後にためていた知らせを 1 回で当てる
 */
export function useOpenChat(chatId: number, visible: boolean) {
  useChatRetain(chatId, visible);
  const chat = useChatOf(chatId);
  const error = useSyncExternalStore(
    (l) => chatStore.subscribe(chatId, "detail", l),
    () => chatStore.detail(chatId).error,
  );
  // 読み込みの印（チャットがあっても、中身を読むまでは会話の欄を描かない）
  const ready = useSyncExternalStore(
    (l) => chatStore.subscribe(chatId, "detail", l),
    () => chatStore.detail(chatId).state === "ready",
  );
  // チャットのプロジェクト（プロジェクトの店から。名前・参照資料などを変えたら、開いている間も直る）。
  // チャット自身のプロジェクトで引く（別のプロジェクトへ移したら、タブが知るのを待たずに移した先のものになる）
  const { projectsById } = useProjects();
  const project = chat ? projectsById.get(chat.project_id) : undefined;
  useLayoutEffect(() => {
    if (!ready) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => chatStore.markPainted(chatId));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [chatId, ready]);
  return { chat, project, error, ready };
}
