import assert from "node:assert/strict";
import { test } from "node:test";
import type { WorktreePortSlot } from "@shared/types";
import { parsePs } from "../platform/macos/processes.js";
import { bandNotes, originOf, selfAndAncestors, selfHelpers, shortCommand, workplaceOf, type Workplace } from "./parse.js";

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

test("selfHelpers: 自分の子孫のうち、自分の .app の束の中のもの（ターミナルのシェル・ほかの Kickoff の Helper は入れない）", () => {
  const t = parsePs(`  500     1 02:00:00 /A/Kickoff.app/Contents/MacOS/Kickoff
  501   500 02:00:00 /A/Kickoff.app/Contents/Frameworks/Kickoff Helper (Renderer).app/Contents/MacOS/Kickoff Helper (Renderer) --type=renderer
  502   500 02:00:00 /A/Kickoff.app/Contents/Frameworks/Kickoff Helper.app/Contents/MacOS/Kickoff Helper --type=utility
  510   500    30:00 /bin/zsh -l
  520   510    12:00 node /work/app/node_modules/.bin/vite
  700     1 01:00:00 /A/Kickoff.app/Contents/MacOS/Kickoff
  701   700 01:00:00 /A/Kickoff.app/Contents/Frameworks/Kickoff Helper.app/Contents/MacOS/Kickoff Helper --type=gpu-process`);
  assert.deepEqual([...selfHelpers(500, "/A/Kickoff.app/", t)].sort(), [501, 502]);
  assert.deepEqual([...selfHelpers(500, null, t)], []);
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
