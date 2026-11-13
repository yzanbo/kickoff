// API のテスト: ポートを使っているプロセス（調べる・止める・チャットの実行が終わったときの見張り）。lsof・ps・シグナルは偽物（portsFake）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { BusEvent, PortProcess } from "@shared/types";
import { makeChat } from "@shared/testing/factories";
import { setup, until } from "../testing/testServer.js";

const LSOF_HEAD = "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\n";
const lsofLine = (pid: number, port: number, name = "node") => `${name} ${pid} me 20u IPv4 0x1 0t0 TCP 127.0.0.1:${port} (LISTEN)\n`;

/** Kickoff（偽の自分は 1000。束は /dev/Electron.app/）の下のシェルから起動した vite・切り離された vite・プロジェクトの外の node・自分の祖先・自分の Helper */
function arrange(s: ReturnType<typeof setup>) {
  const repo = fs.realpathSync(s.project.repo_path);
  s.portsFake.lsof = LSOF_HEAD + lsofLine(2001, 5173) + lsofLine(2001, 24678) + lsofLine(2002, 20100) + lsofLine(2003, 7265) + lsofLine(999, 4317, "Kickoff") + lsofLine(1001, 9333, "Electron\\x20Helper");
  s.portsFake.ps = [
    "  999     1 01:00:00 /Applications/Kickoff.app/Contents/MacOS/Kickoff",
    " 1000   999    50:00 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .",
    " 1001  1000    50:00 /dev/Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper --type=utility",
    " 1500  1000    20:00 /bin/zsh -l",
    " 2001  1500    12:00 node /work/node_modules/.bin/vite",
    " 2002     1    05:00 node /work/node_modules/.bin/vite --port 20100",
    " 2003     1 03:00:00 node /Applications/Raycast.app/x.js",
  ].join("\n");
  s.portsFake.cwds = `p1001\nn${repo}\np2001\nn${repo}\np2002\nn${path.join(repo, "src")}\np2003\nn/\n`;
  return repo;
}

test("GET /api/ports: プロジェクトのフォルダのものだけを、起動元・短いコマンド・帯の添え書き付きで返す（自分と祖先・自分の Helper・外のものは出さない）", async () => {
  const s = setup();
  const repo = arrange(s);
  // 本体のプロセスが、ワークツリー feat-y の帯の番号を使っている
  s.store.worktreeEnvs.put({ path: path.join(repo, "..", "wt-feat-y"), project_id: s.project.id, band: 20100, host: null, slots: [], compose_names: [], rewritten: [], issues: [], blocked: null });
  const events: BusEvent[] = [];
  s.bus.subscribe((e) => events.push(e));
  const res = await s.call("GET", "/api/ports");
  assert.equal(res.status, 200);
  const list = (res.body as { processes: PortProcess[] }).processes;
  assert.deepEqual(
    list.map((p) => [p.pid, p.ports, p.command, p.origin, p.worktree_path]),
    [
      [2001, [5173, 24678], "vite", "kickoff", null],
      [2002, [20100], "vite", "detached", null],
    ],
  );
  assert.equal(list[0].uptime_seconds, 720);
  assert.equal(list[0].command_full, "node /work/node_modules/.bin/vite");
  assert.deepEqual(list[1].bands, [{ port: 20100, worktree_path: path.join(repo, "..", "wt-feat-y"), label: "wt-feat-y", slot: "開発サーバー", mismatch: true }]);
  // ほかの窓には数だけを配る（コマンドの全文は SSE に載せない。窓を開いて調べたときは、新しく現れたものとして知らせない）
  const sent = events.find((e) => e.type === "ports_changed");
  assert.deepEqual(sent, { type: "ports_changed", count: 2, fresh: 0 });
});

test("GET /api/ports?cached=1: 最後に調べた一覧を返し、調べ直さない（まだ調べていなければ調べる）", async () => {
  const s = setup();
  arrange(s);
  const events: BusEvent[] = [];
  s.bus.subscribe((e) => events.push(e));
  // まだ調べていない → 調べる
  let res = await s.call("GET", "/api/ports?cached=1");
  assert.equal((res.body as { processes: PortProcess[] }).processes.length, 2);
  assert.equal(events.length, 1);
  // 新しいサーバーが現れても、覚えた一覧のまま
  s.portsFake.lsof += lsofLine(2004, 3000);
  s.portsFake.ps += "\n 2004     1    00:05 node /work/node_modules/next/dist/bin/next dev";
  s.portsFake.cwds += `p2004\nn${fs.realpathSync(s.project.repo_path)}\n`;
  res = await s.call("GET", "/api/ports?cached=1");
  assert.equal((res.body as { processes: PortProcess[] }).processes.length, 2);
  assert.equal(events.length, 1);
  // 調べ直すと増える
  res = await s.call("GET", "/api/ports");
  assert.equal((res.body as { processes: PortProcess[] }).processes.length, 3);
});

test("チャットの実行が終わったら少し待って調べ、前になかった pid の数を fresh で知らせる", async () => {
  const s = setup();
  arrange(s);
  await s.call("GET", "/api/ports");
  // 実行の間に新しいサーバーが現れた
  s.portsFake.lsof += lsofLine(2004, 3000);
  s.portsFake.ps += "\n 2004     1    00:05 node /work/node_modules/next/dist/bin/next dev";
  s.portsFake.cwds += `p2004\nn${fs.realpathSync(s.project.repo_path)}\n`;
  const events: BusEvent[] = [];
  s.bus.subscribe((e) => events.push(e));
  const chat = makeChat(42, { project_id: s.project.id });
  s.bus.publish({ type: "chat", chat: { ...chat, status: "running" } });
  s.bus.publish({ type: "chat", chat: { ...chat, status: "completed" } });
  await until(() => events.some((e) => e.type === "ports_changed"));
  assert.deepEqual(events.find((e) => e.type === "ports_changed"), { type: "ports_changed", count: 3, fresh: 1 });
  const list = (await s.call("GET", "/api/ports?cached=1")).body as { processes: PortProcess[] };
  assert.equal(list.processes.find((p) => p.pid === 2004)?.command, "next dev");
});

test("POST /api/ports/stop: SIGTERM を送り、残れば stopped: false（強制終了は SIGKILL）。一覧にない・コマンドが変わったものは断る", async () => {
  const s = setup();
  arrange(s);
  const command = "node /work/node_modules/.bin/vite";
  // 止まった
  let res = await s.call("POST", "/api/ports/stop", { pid: 2001, command });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { stopped: true });
  assert.deepEqual(s.portsFake.killed, [{ pid: 2001, signal: "SIGTERM" }]);
  // 残った → 強制終了
  s.portsFake.alive.add(2001);
  res = await s.call("POST", "/api/ports/stop", { pid: 2001, command });
  assert.deepEqual(res.body, { stopped: false });
  res = await s.call("POST", "/api/ports/stop", { pid: 2001, command, force: true });
  assert.deepEqual(s.portsFake.killed.at(-1), { pid: 2001, signal: "SIGKILL" });
  // pid が使い回されて別のコマンドになった
  res = await s.call("POST", "/api/ports/stop", { pid: 2001, command: "node other.js" });
  assert.equal(res.status, 409);
  // プロジェクトの外・自分の祖先は止めさせない
  assert.equal((await s.call("POST", "/api/ports/stop", { pid: 2003, command: "node /Applications/Raycast.app/x.js" })).status, 404);
  assert.equal((await s.call("POST", "/api/ports/stop", { pid: 999, command: "/Applications/Kickoff.app/Contents/MacOS/Kickoff" })).status, 404);
  assert.equal(s.portsFake.killed.length, 3);
});
