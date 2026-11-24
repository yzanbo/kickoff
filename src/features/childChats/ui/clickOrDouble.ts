// 1 回押しとダブルクリックを分ける（親の札: 1 回押しは少し待ってから親の会話へ移り、その間にもう一度押せば名前の変更にする）
import { useEffect, useState, type MouseEvent } from "react";

/** 1 回押しを待つ時間（その間にもう一度押せばダブルクリック） */
const CLICK_OR_DOUBLE_MS = 300;

/** ms 後の予約（取り消す関数を返す。テストは偽の時計 fakeScheduler） */
type Timer = (fn: () => void, ms: number) => () => void;

/**
 * 押した回数（MouseEvent.detail）で分ける: 0 = キーで押した（すぐ onClick）/ 1 = ms 待ってから onClick / 2 = 待っている 1 回押しを捨てて onDouble。
 * 3 回目より後は何もしない。cancel で待っている 1 回押しを捨てる（部品が消えたとき）
 */
export function createClickOrDouble({ timer }: { timer: Timer }, ms = CLICK_OR_DOUBLE_MS) {
  let waiting: (() => void) | undefined;
  const cancel = () => {
    waiting?.();
    waiting = undefined;
  };
  return {
    press(detail: number, onClick: () => void, onDouble: () => void) {
      cancel();
      if (detail === 0) onClick();
      else if (detail === 1)
        waiting = timer(() => {
          waiting = undefined;
          onClick();
        }, ms);
      else if (detail === 2) onDouble();
    },
    cancel,
  };
}

/** 押したときの処理（onClick に渡す）。待っている間に部品が消えたら移らない */
export function useClickOrDouble(onClick: () => void, onDouble: () => void): (e: MouseEvent) => void {
  const [gate] = useState(() =>
    createClickOrDouble({
      timer: (fn, ms) => {
        const id = window.setTimeout(fn, ms);
        return () => window.clearTimeout(id);
      },
    }),
  );
  useEffect(() => gate.cancel, [gate]);
  return (e) => gate.press(e.detail, onClick, onDouble);
}
