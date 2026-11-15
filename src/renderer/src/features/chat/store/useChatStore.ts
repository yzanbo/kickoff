import { useCallback, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { Chat } from "@shared/types";
import { api } from "@/api";
import { subscribeServerEvent, subscribeServerOpen } from "@/api/events";
import { useProjects } from "@/stores/projects";
import type { SubagentsView } from "@/features/chat/subagents/subagentsContext";
import type { ChatVisuals } from "@/features/chat/visuals/visualsContext";
import { relativeOf } from "@/features/chat/timeline/timelineItems";
import { createChatStore, type ChatDetailView, type ChatLogView } from "./chatStore";
import { createChatSelectors, type ChatSubagents } from "./chatSelectors";
import type { Channel } from "./chatStoreTypes";

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
const selectors = createChatSelectors(chatStore);
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
export function useChatDetailView(chatId: number): ChatDetailView {
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

/** 口 detail のチャットだけ（名前・状態などが変わったときだけ描き直す。回答待ち・作業中の様子では描き直さない） */
function useChatOf(chatId: number): Chat | undefined {
  return useSyncExternalStore(
    (l) => chatStore.subscribe(chatId, "detail", l),
    () => chatStore.detail(chatId).chat,
  );
}

/**
 * 1 つのチャットの画面を描くのに要るもの（チャット・プロジェクト・記録の口 log・回答待ち・作業中の様子・読み込みの失敗）を、口ごとの hook から集める。
 * チャットの画面を描く 5 か所（パネルのタブ・右の欄の子チャット・メモのチャット・子チャットとサブエージェントの別ウィンドウ）が使う。
 * 書いている途中の返答は含めない（読む部品だけが口を読む）。中身を描けたら（rAF 2 回）、開いた直後にためていた知らせを 1 回で当てる（案 21）
 */
export function useChatContent(chatId: number, visible: boolean) {
  useChatRetain(chatId, visible);
  const { chat, approvals, live, error } = useChatDetailView(chatId);
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

/** いくつかの口のどれかが変わったら読み直す（取り出し口の値は、入力が同じなら同じ物） */
function useSelected<T>(chatId: number, channels: readonly Channel[], read: () => T): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 口の組は呼ぶ所ごとに決まっている
  const subscribe = useCallback((l: () => void) => {
    const offs = channels.map((c) => chatStore.subscribe(chatId, c, l));
    return () => offs.forEach((off) => off());
  }, [chatId]);
  return useSyncExternalStore(subscribe, read);
}

const SUBAGENT_CHANNELS: readonly Channel[] = ["detail", "log", "progress"];
const LOG_CHANNELS: readonly Channel[] = ["log"];
const DETAIL_CHANNELS: readonly Channel[] = ["detail"];

/**
 * 記録全体から作るものの取り出し口（chatSelectors.ts。同じ世代なら会話の欄と同じ値）。会話の欄のほか、Activity の外の部品
 * （右の欄のタブの印・「サブエージェントを足す」の一覧・右の欄のサブエージェントの画面）が context ではなく直接読む（メモの仕様書「0023_表示を軽くする」の M5）
 */
export const useChatSubagents = (chatId: number): ChatSubagents => useSelected(chatId, SUBAGENT_CHANNELS, () => selectors.subagents(chatId));
/** AI が描いた図（記録から組み立てたもの） */
export const useChatVisuals = (chatId: number): ChatVisuals => useSelected(chatId, LOG_CHANNELS, () => selectors.visuals(chatId));
/** 裏でまだ動いている作業を起動した呼び出しの ID */
export const useChatBackgroundCalls = (chatId: number): ReadonlySet<string> => useSelected(chatId, DETAIL_CHANNELS, () => selectors.backgroundCalls(chatId));

/** サブエージェントのカード・画面が読むもの（SubagentsView。チャットを読めていなければ null） */
export function useChatSubagentsView(chatId: number): SubagentsView | null {
  const { tree, hues, waiting } = useChatSubagents(chatId);
  const chat = useChatOf(chatId);
  const { digest, loaded, tailStart, hasEarlier } = useChatLog(chatId);
  const { projectsById } = useProjects();
  const repoPath = chat ? projectsById.get(chat.project_id)?.repo_path : undefined;
  const projectId = chat?.project_id;
  const worktree = chat?.worktree_path ?? null;
  const busy = chat?.status === "running";
  return useMemo(
    () =>
      projectId === undefined
        ? null
        : { chatId, projectId, worktree, rel: relativeOf(repoPath), busy, events: digest, loaded, tailStart, hasEarlier, tree, hues, waiting },
    [chatId, projectId, worktree, repoPath, busy, digest, loaded, tailStart, hasEarlier, tree, hues, waiting],
  );
}
