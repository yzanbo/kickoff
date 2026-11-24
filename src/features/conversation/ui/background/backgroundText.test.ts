import assert from "node:assert/strict";
import { test } from "vitest";
import { backgroundWaitLabel, countBackground, stopAgentsText } from "./backgroundText";

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

test("止める前の確かめの文: 裏の作業がなければ null。一覧の知らせがなければ一覧の行から数えたサブエージェントを使う", () => {
  const tasks = [{ task_id: "b1", kind: "command" as const, description: "npm run dev" }];
  assert.equal(stopAgentsText({ tasks: [], replied: false }, 2, "中断する"), null);
  assert.equal(stopAgentsText(null, 0, "中断する"), null);
  assert.deepEqual(stopAgentsText(null, 2, "中断する"), {
    title: "裏で動いているサブエージェント 2 件も止まります",
    message: "中断すると、いまの作業と一緒に、裏で動いているサブエージェント 2 件も止まり、サブエージェントの報告は届きません。終わるまで待つときは、キャンセルして「あとで」で送ってください。",
    confirmLabel: "中断する",
  });
  assert.equal(stopAgentsText({ tasks, replied: false }, 3, "中断する")?.title, "裏で動いているコマンド 1 件も止まります");
});
