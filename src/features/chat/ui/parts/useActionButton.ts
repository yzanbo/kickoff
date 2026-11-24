// 押してから返るまで押せなくするボタンの操作（すばやく 2 回押しても 1 回だけ届く）。失敗はダイアログで知らせる（reportFailure）
import { useState } from "react";
import { reportFailure } from "@/foundation/ui/kit/ask";

/** 操作ごとの実行中の印（キーごと。同じキーの操作が返るまで、次は始めない） */
export function createActionLock(onChange: (pending: ReadonlySet<string>) => void) {
  const pending = new Set<string>();
  return {
    /** 始めたら返るまでの Promise、同じキーが実行中なら null（始めない） */
    run(key: string, action: () => Promise<unknown>): Promise<void> | null {
      if (pending.has(key)) return null;
      pending.add(key);
      onChange(new Set(pending));
      return action()
        .then(() => undefined)
        .finally(() => {
          pending.delete(key);
          onChange(new Set(pending));
        });
    },
  };
}

/**
 * ボタンの操作（press(key, action, failure)）と、実行中か（pending(key)。ボタンの disabled に渡す）。一覧の行ごとのボタンはキーを分ける。
 * 確かめのダイアログを挟む操作は、確かめも action の中に入れる（確かめている間も押せない）
 */
export function useActionButton() {
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [lock] = useState(() => createActionLock(setPending));
  return {
    pending: (key = "") => pending.has(key),
    press: (key: string, action: () => Promise<unknown>, failure: string) => void lock.run(key, action)?.catch(reportFailure(failure)),
  };
}
