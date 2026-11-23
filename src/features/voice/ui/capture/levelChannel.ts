// マイクの音量の受け渡し（React の描き直しをせずに、受け取った部品が CSS 変数で大きさを変える）
import { useEffect, useEffectEvent, type RefObject } from "react";

export interface LevelChannel {
  emit(level: number): void;
  /** 受け取る（返した関数でやめる） */
  subscribe(listener: (level: number) => void): () => void;
}

export function createLevelChannel(): LevelChannel {
  const listeners = new Set<(level: number) => void>();
  return {
    emit: (level) => listeners.forEach((f) => f(level)),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/**
 * 音量を要素の CSS 変数（0〜1）に入れる。話し声の RMS はおよそ 0.02〜0.2 なので 8 倍して 0〜1 に広げる。
 * decay を渡せば、下がるときは前の値にそれを掛けてゆっくり戻す（digits はそのときの小数の桁）
 */
export function useLevelVar(subscribe: LevelChannel["subscribe"], cssVar: string, ref: RefObject<HTMLElement | null>, { decay, digits }: { decay?: number; digits?: number } = {}) {
  // 受け取る先は hook が持つ 1 つの入れ物なので、描き直しのたびに付け直さない
  const listen = useEffectEvent((listener: (level: number) => void) => subscribe(listener));
  useEffect(() => {
    let shown = 0;
    return listen((level) => {
      const next = Math.min(1, level * 8);
      shown = decay === undefined ? next : Math.max(next, shown * decay);
      ref.current?.style.setProperty(cssVar, digits === undefined ? String(shown) : shown.toFixed(digits));
    });
  }, [cssVar, decay, digits, ref]);
}
