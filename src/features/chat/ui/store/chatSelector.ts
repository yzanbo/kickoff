// チャットの店の取り出し口の仕組み（店が出すのは仕組みだけで、何を計算するかは持ち主の機能が定義する）
import { useCallback, useSyncExternalStore } from "react";
import { createLruMap } from "@/foundation/ui/lib/lruMap";
import { WARM_CHATS, type Channel, type ChatDetailView, type ChatLogView, type ChatProgressView } from "./chatStoreTypes";

export type ChatChannel = Channel;

/** 取り出し口が読む店の口 */
export interface ChatSource {
  detail(chatId: number): ChatDetailView;
  log(chatId: number): ChatLogView;
  progress(chatId: number): ChatProgressView;
}

/** 取り出し口を置く店（アプリは useChatStore.ts の 1 つ。テストは偽の店） */
export interface SelectorStore extends ChatSource {
  subscribe(chatId: number, channel: Channel, listener: () => void): () => void;
  /** そのチャットの覚えの入れ物（店がチャットを捨てたら一緒に消える。店にないチャットは null） */
  memos(chatId: number): Map<object, unknown> | null;
}

export interface ChatSelector<T> {
  /** 部品の外（操作・ほかの取り出し口）から読む */
  read(chatId: number): T;
  /** 部品から読む（channels の口が変わったときだけ読み直す。値は入力が同じなら同じ物。名前を use にしないのは React の use と取り違えられるため） */
  useFor(chatId: number): T;
  /** 部品から、値の一部だけを読む（pick が同じ値を返す間は描き直さない） */
  useWith<U>(chatId: number, pick: (value: T) => U): U;
}

/** 引数がすべて前と同じ物なら、前の結果を返す（1 つだけ覚える） */
export function memoLast<A extends readonly unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let last: { args: A; value: R } | null = null;
  return (...args) => {
    if (last && args.every((a, i) => a === last!.args[i])) return last.value;
    const value = fn(...args);
    last = { args, value };
    return value;
  };
}

/**
 * 店に取り出し口を定義する口を作る。create はチャットごとに 1 回呼び、返した計算（memoLast で前の結果を覚える）をそのチャットの覚えに置く
 */
export function createSelectorKit(store: SelectorStore) {
  // 店にないチャット（読み込む前・捨てたあと）の覚え。同じ値を返せるよう、店に残す数だけ別に覚える
  const orphans = createLruMap<number, Map<object, unknown>>(WARM_CHATS);
  const memosOf = (chatId: number) => {
    const memos = store.memos(chatId);
    if (memos) return memos;
    let orphan = orphans.get(chatId);
    if (!orphan) orphans.set(chatId, (orphan = new Map()));
    return orphan;
  };
  return function defineChatSelector<T>(channels: readonly ChatChannel[], create: () => (src: ChatSource, chatId: number) => T): ChatSelector<T> {
    const selector: ChatSelector<T> = {
      read(chatId) {
        const memos = memosOf(chatId);
        let compute = memos.get(selector) as ((src: ChatSource, chatId: number) => T) | undefined;
        if (!compute) memos.set(selector, (compute = create()));
        return compute(store, chatId);
      },
      useFor: (chatId) => selector.useWith(chatId, identity<T>),
      useWith(chatId, pick) {
        const subscribe = useCallback(
          (l: () => void) => {
            const offs = channels.map((c) => store.subscribe(chatId, c, l));
            return () => offs.forEach((off) => off());
          },
          [chatId],
        );
        return useSyncExternalStore(subscribe, () => pick(selector.read(chatId)));
      },
    };
    return selector;
  };
}

const identity = <T,>(v: T): T => v;
