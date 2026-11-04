import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnosticsFolderName, perSecond, startCpuProfile, topSelfTime, type CpuProfile } from "./profileSummary.js";

test("性能の記録: 自分の中で時間を使った関数を、同じ関数ごとにまとめて多い順に並べる（空き時間は数えない）", () => {
  const profile: CpuProfile = {
    nodes: [
      { id: 1, callFrame: { functionName: "(idle)", url: "", lineNumber: -1 } },
      { id: 2, callFrame: { functionName: "fit", url: "http://localhost/src/Composer.tsx?t=1", lineNumber: 79 } },
      { id: 3, callFrame: { functionName: "", url: "http://localhost/app.js", lineNumber: 9 } },
      { id: 4, callFrame: { functionName: "(program)", url: "", lineNumber: -1 } },
    ],
    samples: [1, 2, 3, 2, 4, 1],
    timeDeltas: [5000, 3000, 1000, 3000, 3000, 5000],
  };
  assert.deepEqual(topSelfTime(profile), [
    { name: "fit", where: "Composer.tsx:80", selfMs: 6, percent: 60 },
    { name: "(program)", where: "", selfMs: 3, percent: 30 },
    { name: "(anonymous)", where: "app.js:10", selfMs: 1, percent: 10 },
  ]);
  assert.equal(topSelfTime(profile, 1).length, 1);
});

test("性能の記録: 1 秒あたりの処理の時間と、保存するフォルダの名前", () => {
  const before = { ScriptDuration: 1, LayoutDuration: 0.5, RecalcStyleDuration: 0.1, TaskDuration: 2, LayoutCount: 100 };
  const after = { ScriptDuration: 3, LayoutDuration: 0.7, RecalcStyleDuration: 0.1, TaskDuration: 5, LayoutCount: 300 };
  assert.deepEqual(perSecond(before, after, 10), { scriptMs: 200, layoutMs: 20, styleMs: 0, taskMs: 300, layoutCount: 20 });
  assert.equal(diagnosticsFolderName(new Date(2026, 10, 3, 22, 5, 9)), "20261103-220509");
});

test("CPU プロファイル: 画面とメインプロセスで同じ命令で取り（1 ミリ秒ごと）、止めたらプロファイルを返す", async () => {
  const sent: [string, object | undefined][] = [];
  const profile: CpuProfile = { nodes: [], samples: [], timeDeltas: [] };
  const stop = await startCpuProfile(async (method, params) => (sent.push([method, params]), method === "Profiler.stop" ? { profile } : {}));
  assert.deepEqual(sent.map(([m]) => m), ["Profiler.enable", "Profiler.setSamplingInterval", "Profiler.start"]);
  assert.deepEqual(sent[1][1], { interval: 1000 });
  assert.equal(await stop(), profile);
  assert.equal(sent.at(-1)?.[0], "Profiler.stop");
});
