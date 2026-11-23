// テストのデータで機能を知らないもの（既定の時刻・SSE の知らせ）。テストからだけ使う
import type { BusEvent } from "@shared/foundation/contract";

/** 既定の時刻（機能ごとの testing.ts の make… が使う） */
export const TEST_TIME = "2026-11-01T00:00:00Z";

/** SSE の知らせ（type で残りの形が決まる） */
export function busEvent<T extends BusEvent["type"]>(type: T, data: Omit<Extract<BusEvent, { type: T }>, "type">): Extract<BusEvent, { type: T }> {
  return { type, ...data } as Extract<BusEvent, { type: T }>;
}

/**
 * ワークツリー（GitWorktree の形。作業するフォルダ・一番上ともに path、ブランチなし・本体でない）。
 * 型の持ち主は shared/git だが、土台の画面（workplace）と下の機能のテストも使うので、型を読まずに形だけで作る（渡した先の型で確かめる）
 */
export function makeWorktree<P extends object = object>(path: string, patch: P = {} as P) {
  return { path, root: path, branch: null as string | null, head: "0000000", main: false, locked: false, prunable: false, ...patch };
}
