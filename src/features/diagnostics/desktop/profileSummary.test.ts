import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { startCpuProfile, topSelfTime, type CpuProfile } from "@/foundation/core/system/cpuProfile";
import { diagnosticsFolderName, perSecond, RENDERER_PROBE } from "./profileSummary";

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

test("RENDERER_PROBE: 数える画面のクラス名は、どれも画面の部品の className にある（CSS の名前を変えたら、ここで落ちて気づく）", () => {
  // 外のパッケージが付けるクラス（xterm・Monaco）は数えない
  const vendor = new Set(["xterm", "monaco-editor"]);
  const selectors = [...RENDERER_PROBE.matchAll(/querySelectorAll\("([^"]+)"\)/g)].map((m) => m[1]);
  const classes = [...new Set(selectors.flatMap((s) => [...s.matchAll(/\.([a-z][a-z0-9-]*)/g)].map((m) => m[1])))].filter((c) => !vendor.has(c));
  assert.ok(classes.length >= 6, `クラス名を読めていません: ${classes.join(", ")}`);
  const files = execFileSync("git", ["ls-files", "src/features/*.tsx", "src/foundation/ui/*.tsx"], { encoding: "utf8" }).split("\n").filter(Boolean);
  const texts = files.map((f) => readFileSync(f, "utf8"));
  const used = (c: string) => texts.some((text) => new RegExp(`className=[^>]*(?<![\\w-])${c}(?![\\w-])`).test(text));
  assert.deepEqual(classes.filter((c) => !used(c)), [], "RENDERER_PROBE のクラス名が画面の部品にない（profileSummary.ts を直す）");
});
