import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { api } from "@/api";
import { subscribeServerEvent, subscribeServerOpen } from "@/api/events";
import { useProjects } from "@/stores/projects";
import { createChatStore, type ChatDetailView, type ChatLogView, type ChatProgressView } from "./chatStore";

/*
 * アプリで使うチャットの店（1 つだけ）と、口ごとの React の hook。店はモジュールを読んだときにサーバーの知らせを購読し、
 * 部品の hook より先に知らせを受ける。テストはこのモジュールを使わず、createChatStore で作った店を試す
 */
const chatStore = createChatStore({
  frame: (fn) => {
    const id = requestAnimationFrame(fn);
    return () => cancelAnimationFrame(id);
  },
  timer: (fn, ms) => {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
  now: () => Date.now(),
  windowHidden: () => document.visibilityState === "hidden",
  load: (chatId, query) => api.chatDetail(chatId, query),
  page: (chatId, query) => api.chatEvents(chatId, query),
});
subscribeServerEvent((event) => chatStore.apply(event));
subscribeServerOpen(() => chatStore.reconnected());
// ウィンドウが表に出たら、ためていた途中の文をすぐ当てる
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") chatStore.windowShown();
});

/**
 * チャットを見る（描いている間。見る部品のいない中身は店に残り、知らせを当て続ける）。visible はパネルの裏のタブ・閉じたパネルで false
 * （書いている途中の返答を当てる間隔に効く）。読む口より先に、描いたときに頼む
 */
function useChatRetain(chatId: number, visible: boolean) {
  const handle = useRef<ReturnType<typeof chatStore.retain> | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  useLayoutEffect(() => {
    const h = chatStore.retain(chatId, visibleRef.current ? "visible" : "hidden");
    handle.current = h;
    return () => {
      h.release();
      handle.current = null;
    };
  }, [chatId]);
  useLayoutEffect(() => handle.current?.setVisibility(visible ? "visible" : "hidden"), [visible]);
}

/** 口 detail（チャット・回答待ち・作業中の様子・読み込みの失敗） */
function useChatEntry(chatId: number): ChatDetailView {
  return useSyncExternalStore(
    (l) => chatStore.subscribe(chatId, "detail", l),
    () => chatStore.detail(chatId),
  );
}

/** 口 log（流れに出す記録・末尾・記録全体から作るものに渡す digest・読み込んだ範囲） */
export function useChatLog(chatId: number): ChatLogView {
  return useSyncExternalStore(
    (l) => chatStore.subscribe(chatId, "log", l),
    () => chatStore.log(chatId),
  );
}

/**
 * 記録の読み足し（メモの仕様書「0023_表示を軽くする」の案 4）: 前を読む・途中の一部分の後ろを読む・遠い記録を読む・末尾に戻る・
 * サブエージェントの中を読む・その記録を流れに出しているか
 */
export const chatLog = {
  loadEarlier: (chatId: number) => chatStore.loadEarlier(chatId),
  loadLater: (chatId: number) => chatStore.loadLater(chatId),
  openAround: (chatId: number, eventId: number) => chatStore.openAround(chatId, eventId),
  backToTail: (chatId: number) => chatStore.backToTail(chatId),
  loadScope: (chatId: number, parents: readonly string[], ids?: readonly number[]) => chatStore.loadScope(chatId, parents, ids),
  shows: (chatId: number, eventId: number) => chatStore.shows(chatId, eventId),
};

/** 書いている途中の返答の世代（記録の口から選んで読む。消したときだけ変わり、確定した返答が記録に入る描き直しと同じ 1 回で進む） */
export function useChatStreamGen(chatId: number): number {
  return useSyncExternalStore(
    (l) => chatStore.subscribe(chatId, "log", l),
    () => chatStore.log(chatId).streamGen,
  );
}

/** 書いている途中の返答があるか（真偽。書き始め・消したときだけ描き直す） */
export function useStreamingActive(chatId: number): boolean {
  const gen = useChatStreamGen(chatId);
  return useSyncExternalStore(
    (l) => chatStore.subscribe(chatId, "streaming", l),
    () => chatStore.streamText(chatId, gen) !== "",
  );
}

/**
 * 書いている途中の返答の、その世代の文の読み方と購読の仕方（`useStreamReveal` に渡す。文は React の state に入れず、
 * 少しずつ出す rAF の中で読む。同じチャット・世代なら同じ物を返す）
 */
const sources = new Map<string, { read: () => string; subscribe: (l: () => void) => () => void }>();
export function streamingSource(chatId: number, gen: number) {
  const key = `${chatId}:${gen}`;
  let source = sources.get(key);
  if (!source) {
    source = { read: () => chatStore.streamText(chatId, gen), subscribe: (l) => chatStore.subscribe(chatId, "streaming", l) };
    // 古い世代の読み方は持ち続けない（書いている途中の返答は 1 チャットに 1 つ）
    for (const k of sources.keys()) if (k.startsWith(`${chatId}:`)) sources.delete(k);
    sources.set(key, source);
  }
  return source;
}

/** 書いている途中の返答が最後に届いた時刻（作業中の行の「動きがない」の目安。描くときに読む） */
export const streamingLastAt = (chatId: number): string | null => chatStore.streamLastAt(chatId);

/** 口 progress（サブエージェントの途中経過） */
export function useChatProgress(chatId: number): ChatProgressView {
  return useSyncExternalStore(
    (l) => chatStore.subscribe(chatId, "progress", l),
    () => chatStore.progress(chatId),
  );
}

/**
 * 1 つのチャットの画面を描くのに要るもの（チャット・プロジェクト・記録の口 log・回答待ち・作業中の様子・読み込みの失敗）を、口ごとの hook から集める。
 * チャットの画面を描く 5 か所（パネルのタブ・右の欄の子チャット・メモのチャット・子チャットとサブエージェントの別ウィンドウ）が使う。
 * 書いている途中の返答は含めない（読む部品だけが口を読む）。中身を描けたら（rAF 2 回）、開いた直後にためていた知らせを 1 回で当てる（案 21）
 */
export function useChatContent(chatId: number, visible: boolean) {
  useChatRetain(chatId, visible);
  const { chat, approvals, live, error } = useChatEntry(chatId);
  const log = useChatLog(chatId);
  // チャットのプロジェクト（プロジェクトの店から。名前・参照資料などを変えたら、開いている間も直る）。
  // チャット自身のプロジェクトで引く（別のプロジェクトへ移したら、タブが知るのを待たずに移した先のものになる）
  const { projectsById } = useProjects();
  const project = chat ? projectsById.get(chat.project_id) : undefined;
  const loaded = chat !== undefined;
  useLayoutEffect(() => {
    if (!loaded) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => chatStore.markPainted(chatId));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [chatId, loaded]);
  return { chat, project, log, approvals, live, error };
}
