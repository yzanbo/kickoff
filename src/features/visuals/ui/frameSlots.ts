import { useCallback, useEffect, useRef, useState } from "react";
import { createLruMap } from "@/foundation/ui/lib/lruMap";

/**
 * AI が描いた図の枠（iframe）を同時に読み込む数の上限と、描いた枠の高さの覚え。
 * 遠くの発言へ移って図がたくさんある所に着いたとき、枠のページ・中のスクリプト・CDN の読み込みが一度に走って画面が止まらないようにする
 */

/** 同時に読み込む枠の数（中から ready が届くまでを読み込み中と数える） */
const FRAME_LOAD_LIMIT = 4;
/** ready が届かないとき（読み込みの失敗など）に、読み込み中と数えるのをやめるまでの時間 */
const FRAME_LOAD_TIMEOUT_MS = 10_000;

export interface Slots {
  /** 空きができたら onGrant を呼ぶ（空いていればすぐ）。返す関数で、もらった空きを返す・待つのをやめる（何度呼んでもよい） */
  acquire(onGrant: () => void): () => void;
}

/** 空きの数が limit の順番待ち（古い順に渡す） */
export function createSlots(limit: number): Slots {
  let used = 0;
  const waiting: (() => void)[] = [];
  return {
    acquire(onGrant) {
      let granted = false;
      let done = false;
      const grant = () => {
        granted = true;
        used += 1;
        onGrant();
      };
      if (used < limit) grant();
      else waiting.push(grant);
      return () => {
        if (done) return;
        done = true;
        if (!granted) {
          const at = waiting.indexOf(grant);
          if (at >= 0) waiting.splice(at, 1);
          return;
        }
        used -= 1;
        waiting.shift()?.();
      };
    },
  };
}

const frameSlots = createSlots(FRAME_LOAD_LIMIT);

/**
 * 枠を読み込んでよいか（active の間、順番待ちに並ぶ）と、読み込み終えたら空きを返す関数（ready が届いたら呼ぶ。10 秒で自然に返す）。
 * 一度もらったら true のまま（外したら空きを返す）
 */
export function useFrameSlot(active: boolean): [granted: boolean, release: () => void] {
  const [granted, setGranted] = useState(false);
  const grantedRef = useRef(false);
  const release = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!active || grantedRef.current) return;
    let timer = 0;
    const giveBack = frameSlots.acquire(() => {
      grantedRef.current = true;
      setGranted(true);
      timer = window.setTimeout(() => giveBack(), FRAME_LOAD_TIMEOUT_MS);
    });
    release.current = () => {
      window.clearTimeout(timer);
      giveBack();
    };
    // 待っている間に外れた・見張りをやめたら、待つのをやめる（もらったあとは ready か外したときに返す）
    return () => {
      if (!grantedRef.current) release.current?.();
    };
  }, [active]);
  // 外したときも空きを返す（もらったあとは上の effect の片付けが流れないため）
  useEffect(() => () => release.current?.(), []);
  return [granted, useCallback(() => release.current?.(), [])];
}

/** 描いた枠の高さ（図の ID と中身ごと。次に同じ図の枠を置くまでの高さにする） */
const heights = createLruMap<string, number>(200);
export const frameHeightKey = (id: string, code: string) => `${id}\u0000${code}`;
export const rememberedFrameHeight = (key: string): number | undefined => heights.peek(key);
export const rememberFrameHeight = (key: string, height: number) => {
  if (height > 0) heights.set(key, height);
};
