// 裏に回しても止めない会話の欄（keepAlive）
import { createContext, useCallback, useContext, useState, useSyncExternalStore } from "react";

/**
 * 会話の欄を止めない理由: 音声モード・音声入力の録音と文字起こし・添付のアップロード・送信待ちの書き直し・預かった指示の書き直し。
 * どれも裏に回しても続け、止めると利用者の操作が途中で切れる
 */
const KEEP_ALIVE_REASONS = ["voice", "dictation", "upload", "queueEdit", "heldEdit"] as const;
export type KeepAliveReason = (typeof KEEP_ALIVE_REASONS)[number];

/**
 * チャットごとの、会話の欄を止めない理由の店（理由を立てた持ち主ごとに覚える。同じチャットの 2 つの入力欄が別々にアップロードしても、
 * 両方が終わるまで止めない）。テストは作る関数で作り、アプリは下の 1 つを使う
 */
export function createKeepAlive() {
  const holds = new Map<number, Map<unknown, KeepAliveReason>>();
  const listeners = new Map<number, Set<() => void>>();
  const notify = (chatId: number) => listeners.get(chatId)?.forEach((l) => l());
  return {
    /** 持ち主の理由を立てる（on）・外す */
    set(chatId: number, owner: unknown, reason: KeepAliveReason, on: boolean) {
      const map = holds.get(chatId);
      const was = map?.size ?? 0;
      if (on) {
        if (map?.get(owner) === reason) return;
        if (map) map.set(owner, reason);
        else holds.set(chatId, new Map([[owner, reason]]));
      } else {
        if (!map?.delete(owner)) return;
        if (map.size === 0) holds.delete(chatId);
      }
      if ((holds.get(chatId)?.size ?? 0) > 0 !== was > 0) notify(chatId);
    },
    /** 止めない理由があるか */
    alive: (chatId: number): boolean => (holds.get(chatId)?.size ?? 0) > 0,
    /** いま立っている理由（重ねない。診断とテスト） */
    reasons: (chatId: number): KeepAliveReason[] => [...new Set(holds.get(chatId)?.values() ?? [])],
    /** そのチャットの理由をすべて外す（チャットの画面を閉じたとき） */
    clear(chatId: number) {
      if (!holds.delete(chatId)) return;
      notify(chatId);
    },
    subscribe(chatId: number, listener: () => void): () => void {
      let set = listeners.get(chatId);
      if (!set) listeners.set(chatId, (set = new Set()));
      set.add(listener);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(chatId);
      };
    },
  };
}

const keepAlive = createKeepAlive();

/**
 * 理由を立てる・外す（操作・effect の本体から。片付けの中では呼ばない: 隠した会話の欄（Activity の hidden）も片付けを流すので、
 * 片付けで外すと「隠す → 外れる → さらに片付く」の輪になる）。owner を省くと理由そのものを持ち主にする（チャットに 1 つだけのもの）
 */
export const setKeepAlive = (chatId: number, reason: KeepAliveReason, on: boolean, owner: unknown = reason) => keepAlive.set(chatId, owner, reason, on);

/** チャットの画面（殻）を閉じたとき、そのチャットの理由をすべて外す */
export const clearKeepAlive = (chatId: number) => keepAlive.clear(chatId);

/** そのチャットの会話の欄を止めない理由があるか（あれば会話の欄を止めず、hidden で隠すだけにする） */
export function useKeepAlive(chatId: number): boolean {
  return useSyncExternalStore(
    useCallback((l: () => void) => keepAlive.subscribe(chatId, l), [chatId]),
    () => keepAlive.alive(chatId),
  );
}

/** 中の部品が理由を立てる先のチャット（チャットの画面の殻 ChatView が入れる。外では null で、理由は立てない） */
export const KeepAliveContext = createContext<number | null>(null);

/** 中の部品（音声入力・音声モード・添付）から、その部品を持ち主にして理由を立てる・外す関数（同じ部品なら同じ関数） */
export function useKeepAliveHold(reason: KeepAliveReason): (on: boolean) => void {
  const chatId = useContext(KeepAliveContext);
  const [owner] = useState(() => Symbol(reason));
  return useCallback((on: boolean) => {
    if (chatId !== null) keepAlive.set(chatId, owner, reason, on);
  }, [chatId, owner, reason]);
}
