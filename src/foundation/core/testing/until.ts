// 条件を待つ（決め打ちの時間で待ってから比べない）。テストからだけ使う
import assert from "node:assert/strict";

/** 少し待つ（ほかの非同期の処理を進める） */
export const tick = () => new Promise((r) => setTimeout(r, 10));

/** cond が満たされるまで待つ（既定 2 秒で失敗。別のプロセスの起動を待つなど、負荷で遅れうるものは ms を長くする） */
export async function until(cond: () => boolean, ms = 2000) {
  for (let i = 0; i < ms / 10 && !cond(); i++) await tick();
  assert.ok(cond(), "条件を満たしませんでした");
}
