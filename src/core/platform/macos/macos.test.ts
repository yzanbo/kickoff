import assert from "node:assert/strict";
import { test } from "node:test";
import { macosDockerStarterOf } from "./docker.js";
import { parseCwds } from "./listening.js";
import { appBundleOf, parseEtime, parsePs } from "./processes.js";
import { parseChildren } from "./shell.js";

const PS = `    1     0 10-00:00:00 /sbin/launchd
  500     1 02:00:00 /Applications/Kickoff.app/Contents/MacOS/Kickoff
  510   500    30:00 /bin/zsh -l
  520   510    12:00 node /work/app/node_modules/.bin/vite
  600     1    05:00 node /work/app/node_modules/.bin/vite --port 5174
  700     1 01:00:00 /Applications/Visual Studio Code.app/Contents/MacOS/Electron
  710   700    50:00 /bin/zsh
  720   710    40:00 next-server (v15)
  730     1    00:10 python3 -c \\012import http.server\\012s = 1\\012
`;

test("parseEtime: 分:秒・時:分:秒・日-時:分:秒（読めなければ null）", () => {
  assert.equal(parseEtime("05:07"), 307);
  assert.equal(parseEtime("02:00:01"), 7201);
  assert.equal(parseEtime("3-01:00:00"), 3 * 86_400 + 3600);
  assert.equal(parseEtime("?"), null);
});

test("parsePs: pid・親・動いている時間・コマンド（空白を含むパスもそのまま）", () => {
  const t = parsePs(PS);
  assert.equal(t.size, 9);
  // ps が \012 と書いた改行は空白にする
  assert.equal(t.get(730)?.command, "python3 -c import http.server s = 1");
  assert.deepEqual(t.get(520), { pid: 520, ppid: 510, elapsed: 720, command: "node /work/app/node_modules/.bin/vite" });
  assert.equal(t.get(700)?.command, "/Applications/Visual Studio Code.app/Contents/MacOS/Electron");
});

test("appBundleOf: 実行ファイルの .app の束（.app でなければ null）", () => {
  assert.equal(appBundleOf("/A/Kickoff.app/Contents/MacOS/Kickoff"), "/A/Kickoff.app/");
  assert.equal(appBundleOf("/w/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"), "/w/node_modules/electron/dist/Electron.app/");
  assert.equal(appBundleOf("/opt/homebrew/bin/node"), null);
});

test("parseCwds: lsof -Fpn の p と n の行", () => {
  const out = "p520\nfcwd\nn/work/app\np600\nfcwd\nn/work/app wt\n";
  assert.deepEqual([...parseCwds(out)], [
    [520, "/work/app"],
    [600, "/work/app wt"],
  ]);
});

test("macosDockerStarterOf: context の名前から開くアプリ・コピーするコマンド", () => {
  assert.deepEqual(macosDockerStarterOf("orbstack"), { kind: "open", app: "OrbStack", label: "OrbStack を開く" });
  assert.deepEqual(macosDockerStarterOf("desktop-linux"), { kind: "open", app: "Docker", label: "Docker Desktop を開く" });
  assert.deepEqual(macosDockerStarterOf("colima"), { kind: "copy", command: "colima start" });
  assert.deepEqual(macosDockerStarterOf("colima-dev"), { kind: "copy", command: "colima start --profile dev" });
  assert.equal(macosDockerStarterOf("default"), null);
  assert.equal(macosDockerStarterOf(null), null);
});

test("parseChildren: ps の pid・ppid の行を、親 → 子の並びにする（読めない行は飛ばす）", () => {
  const children = parseChildren("  10     1\n  11    10\n  12    10\n  13    11\n\n  x  y\n");
  assert.deepEqual(children.get(10), [11, 12]);
  assert.deepEqual(children.get(11), [13]);
  assert.equal(children.get(12), undefined);
});
