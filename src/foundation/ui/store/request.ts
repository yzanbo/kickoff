import { createSignal } from "@shared/foundation/signal";
import { realTimers, type Timers } from "@shared/foundation/time";

/**
 * 一度きりの頼み（ピントを置く・その行へ移るなど）。開いている受け手には知らせで、これから開く受け手は描いたときに take で受け取る。
 * 受け取られないまま ttlMs を過ぎた頼みは捨てる（開くのに失敗した所を、あとで開いたときに急に動かさないため）
 */
export interface Request<T> {
  /** 頼む（聞いている受け手に知らせる） */
  ask(value: T): void;
  /** 受け取る（受け取ったら消す。なければ・古ければ undefined） */
  take(): T | undefined;
  /** 受け取らずに、まだ頼みがあるかだけを見る */
  peek(): T | undefined;
  /** 頼まれたら listener を呼ぶ。やめるときは返り値を呼ぶ */
  subscribe(listener: () => void): () => void;
}

export function createRequest<T = true>(ttlMs: number, { now }: Pick<Timers, "now"> = realTimers): Request<T> {
  let pending: { value: T; at: number } | undefined;
  const asked = createSignal();
  const peek = () => (pending && now() - pending.at <= ttlMs ? pending.value : undefined);
  return {
    ask: (value) => {
      pending = { value, at: now() };
      asked.emit();
    },
    take: () => {
      const value = peek();
      pending = undefined;
      return value;
    },
    peek,
    subscribe: asked.subscribe,
  };
}
