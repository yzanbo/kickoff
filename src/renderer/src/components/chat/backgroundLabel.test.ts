import assert from "node:assert/strict";
import { test } from "node:test";
import { backgroundWaitLabel, countBackground } from "./backgroundLabel.js";

test("裏の作業を待っている行: 返答を書き終えたときだけ、種類ごとに数と名前を出す", () => {
  const tasks = [
    { task_id: "a1", kind: "agent" as const, description: "調査" },
    { task_id: "b1", kind: "command" as const, description: "npm run dev" },
  ];
  assert.equal(backgroundWaitLabel({ tasks, replied: false }), undefined);
  assert.equal(backgroundWaitLabel({ tasks: [], replied: true }), undefined);
  assert.equal(backgroundWaitLabel(null), undefined);
  assert.equal(
    backgroundWaitLabel({ tasks, replied: true }),
    "返答は終わりました。裏で動いているサブエージェント 1 件（調査）とコマンド 1 件（npm run dev）の終わりを待っています",
  );
  const many = ["A", "B", "C", "D"].map((d, i) => ({ task_id: `a${i}`, kind: "agent" as const, description: d }));
  assert.equal(backgroundWaitLabel({ tasks: many, replied: true }), "返答は終わりました。裏で動いているサブエージェント 4 件（A・B ほか 2 件）の終わりを待っています");
  assert.deepEqual(countBackground({ tasks, replied: true }), { agents: 1, commands: 1 });
  assert.deepEqual(countBackground(null), { agents: 0, commands: 0 });
});
