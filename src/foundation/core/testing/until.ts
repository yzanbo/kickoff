// 条件を待つ（決め打ちの時間で待ってから比べない）。テストからだけ使う
import assert from "node:assert/strict";

/** 条件を見直す間（10ms。ほかの非同期の処理を進める。筋書きの殻 scenarioDriver も使う） */
export const tick = () => new Promise((r) => setTimeout(r, 10)); // test-rules-ignore: 補助の中の待ち

/** cond が満たされるまで待つ（既定 2 秒で失敗。別のプロセスの起動を待つなど、負荷で遅れうるものは ms を長くする。cond は API を読むなど非同期でもよい） */
export async function until(cond: () => boolean | Promise<boolean>, ms = 2000) {
  for (let i = 0; i < ms / 10 && !(await cond()); i++) await tick();
  assert.ok(await cond(), "条件を満たしませんでした");
}
