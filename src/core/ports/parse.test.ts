import assert from "node:assert/strict";
import { test } from "node:test";
import type { WorktreePortSlot } from "@shared/types";
import { bandNotes, originOf, parseCwds, parseEtime, parsePs, selfAndAncestors, shortCommand, workplaceOf, type Workplace } from "./parse.js";

test("parseEtime: 分:秒・時:分:秒・日-時:分:秒（読めなければ null）", () => {
  assert.equal(parseEtime("05:07"), 307);
  assert.equal(parseEtime("02:00:01"), 7201);
  assert.equal(parseEtime("3-01:00:00"), 3 * 86_400 + 3600);
  assert.equal(parseEtime("?"), null);
});

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

test("parsePs: pid・親・動いている時間・コマンド（空白を含むパスもそのまま）", () => {
  const t = parsePs(PS);
  assert.equal(t.size, 9);
  // ps が \012 と書いた改行は空白にする
  assert.equal(t.get(730)?.command, "python3 -c import http.server s = 1");
  assert.deepEqual(t.get(520), { pid: 520, ppid: 510, elapsed: 720, command: "node /work/app/node_modules/.bin/vite" });
  assert.equal(t.get(700)?.command, "/Applications/Visual Studio Code.app/Contents/MacOS/Electron");
});

test("originOf: Kickoff の子孫は Kickoff の中・親が launchd は切り離されている・ほかはアプリの名前を添える", () => {
  const t = parsePs(PS);
  assert.deepEqual(originOf(520, 500, t), { origin: "kickoff", app: null });
  assert.deepEqual(originOf(600, 500, t), { origin: "detached", app: null });
  assert.deepEqual(originOf(720, 500, t), { origin: "other", app: "Visual Studio Code" });
  assert.deepEqual(originOf(999, 500, t), { origin: "other", app: null });
});

test("selfAndAncestors: 自分と祖先（launchd は入れない）", () => {
  assert.deepEqual([...selfAndAncestors(510, parsePs(PS))], [510, 500]);
});

test("parseCwds: lsof -Fpn の p と n の行", () => {
  const out = "p520\nfcwd\nn/work/app\np600\nfcwd\nn/work/app wt\n";
  assert.deepEqual([...parseCwds(out)], [
    [520, "/work/app"],
    [600, "/work/app wt"],
  ]);
});

test("shortCommand: スクリプトの名前・node_modules のパッケージ・サブコマンド・python -m", () => {
  assert.equal(shortCommand("node /work/app/node_modules/.bin/vite"), "vite");
  assert.equal(shortCommand("node /work/app/node_modules/.bin/vite --port 5174"), "vite");
  assert.equal(shortCommand("node /work/app/node_modules/next/dist/bin/next dev"), "next dev");
  assert.equal(shortCommand("node --inspect /w/node_modules/tsx/dist/cli.mjs watch src/index.ts"), "tsx watch");
  assert.equal(shortCommand("node /w/node_modules/@scope/pkg/dist/index.js"), "@scope/pkg");
  assert.equal(shortCommand("/opt/homebrew/bin/python3 -m http.server 8000"), "python3 -m http.server");
  assert.equal(shortCommand("/usr/local/bin/rails server -p 3000"), "rails server");
  assert.equal(shortCommand("next-server (v15)"), "next-server");
  assert.equal(shortCommand("/opt/homebrew/Cellar/python@3.14/3.14.7/Frameworks/Python.framework/Versions/3.14/Resources/Python.app/Contents/MacOS/Python -c import http.server"), "python -c");
  assert.equal(shortCommand("node -e require('http').createServer().listen(3000)"), "node -e");
});

const places: Workplace[] = [
  { project_id: 1, path: "/work/app", worktree_path: null, branch: "main" },
  { project_id: 1, path: "/work/app-worktrees/feat-x", worktree_path: "/work/app-worktrees/feat-x", branch: "feat-x" },
  { project_id: 2, path: "/work/app/packages/web", worktree_path: null, branch: "main" },
];

test("workplaceOf: いちばん深く入る作業場所（名前の続きの別フォルダには入らない）", () => {
  assert.equal(workplaceOf("/work/app/src", places)?.project_id, 1);
  assert.equal(workplaceOf("/work/app/packages/web/src", places)?.project_id, 2);
  assert.equal(workplaceOf("/work/app-worktrees/feat-x", places)?.branch, "feat-x");
  assert.equal(workplaceOf("/work/apple", places), undefined);
});

test("bandNotes: 帯の中の番号だけ。+00 は開発サーバー・対応表の名前・持ち主と違えば mismatch", () => {
  const slot: WorktreePortSlot = { kind: "docker", compose_dir: "", service: "db", target: 5432, protocol: "tcp", original: 5432, port: 20201 };
  const owners = [
    { worktree_path: "/wt/feat-x", band: 20100, slots: [], label: "feat-x" },
    { worktree_path: "/wt/feat-y", band: 20200, slots: [slot], label: "feat-y" },
  ];
  assert.deepEqual(bandNotes([5173, 20100], owners, "/wt/feat-x"), [{ port: 20100, worktree_path: "/wt/feat-x", label: "feat-x", slot: "開発サーバー", mismatch: false }]);
  assert.deepEqual(bandNotes([20201, 20250, 20300], owners, null), [
    { port: 20201, worktree_path: "/wt/feat-y", label: "feat-y", slot: "db", mismatch: true },
    { port: 20250, worktree_path: "/wt/feat-y", label: "feat-y", slot: null, mismatch: true },
  ]);
});
