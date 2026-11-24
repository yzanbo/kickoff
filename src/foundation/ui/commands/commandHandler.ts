import { useEffect } from "react";
import { useLatest } from "@/foundation/ui/hooks/useLatest";

/**
 * 部品が持つ操作を、コマンドの run から呼ぶ口（サイドバーの開閉の外の、部品の中の状態を使う操作: 戻る・進む・欄の開閉・選ぶのをやめる など）。
 * 部品が出ている間だけ受け、出ている部品すべてを呼ぶ（サイドバーとボードの選択のように 2 つ出ていることがある）
 */
export interface CommandHandler<A extends unknown[]> {
  /** 出ている部品の操作を呼ぶ。どれかが false 以外を返したら true（なければ false = キーを奪わない） */
  run(...args: A): boolean;
  /** 部品の操作を足す（戻り値で外す。ふつうは useCommandHandler） */
  add(fn: (...args: A) => boolean | void): () => void;
}

export function commandHandler<A extends unknown[] = []>(): CommandHandler<A> {
  const fns = new Set<(...args: A) => boolean | void>();
  return {
    run: (...args) => [...fns].map((fn) => fn(...args) !== false).some(Boolean),
    add: (fn) => {
      fns.add(fn);
      return () => void fns.delete(fn);
    },
  };
}

/** 部品が出ている間（enabled の間）、その操作をコマンドから呼べるようにする（いつも最新の fn を呼ぶ） */
export function useCommandHandler<A extends unknown[]>(handler: CommandHandler<A>, fn: (...args: A) => boolean | void, enabled = true): void {
  const latest = useLatest(fn);
  useEffect(() => (enabled ? handler.add((...args) => latest.current(...args)) : undefined), [handler, enabled, latest]);
}
