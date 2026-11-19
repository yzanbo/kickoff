import assert from "node:assert/strict";
import { test } from "vitest";
import { Store } from "@/foundation/core/db/store";
import type { ListeningSocket, ProcessProbe, ProcessRow } from "@/foundation/core/platform/types";
import { afterTest } from "@/foundation/core/testing/afterTest";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { PortProcessService } from "./service";

/*
 * コアが別のプロセス（Helper）のときの PortProcessService:
 * selfPid にメインプロセスの pid を渡すと、メイン・その祖先・束の中の Helper（コアのプロセス）は一覧に出さず止めさせない。
 * Kickoff の中のターミナルから起こしたもの（束の外）は「Kickoff の中」として出す
 */

const BUNDLE = "/Applications/Kickoff.app/";
const MAIN = 100;
const CORE = 101;

function setup() {
  const repo = tempDir({ real: true });
  const store = new Store(":memory:");
  afterTest(() => store.close());
  const project = store.projects.create({ name: "p", repo_path: repo, provider: "claude" });
  const rows: ProcessRow[] = [
    { pid: 1, ppid: 0, elapsed: 9999, command: "/sbin/launchd" },
    { pid: MAIN, ppid: 1, elapsed: 600, command: `${BUNDLE}Contents/MacOS/Kickoff` },
    { pid: CORE, ppid: MAIN, elapsed: 590, command: `${BUNDLE}Contents/Frameworks/Kickoff Helper.app/Contents/MacOS/Kickoff Helper --type=utility --service-name=Kickoff Core` },
    { pid: 102, ppid: CORE, elapsed: 300, command: "/bin/zsh -il" },
    { pid: 103, ppid: 102, elapsed: 200, command: "node node_modules/.bin/vite --port 3000" },
  ];
  const sockets: ListeningSocket[] = [
    { process: "Kickoff Helper", pid: CORE, address: "127.0.0.1:4317", port: 4317 },
    { process: "node", pid: 103, address: "*:3000", port: 3000 },
  ];
  const killed: number[] = [];
  const probe: ProcessProbe = {
    listeningSockets: async () => sockets,
    processTable: async () => new Map(rows.map((r) => [r.pid, r])),
    // コアのプロセスもプロジェクトのフォルダで動いているとみなす（それでも出さないことを確かめる）
    processCwds: async (pids) => new Map(pids.map((pid) => [pid, repo])),
    kill: (pid) => void killed.push(pid),
    alive: () => false,
  };
  const service = new PortProcessService({ store, probe, selfPid: MAIN, selfBundle: BUNDLE, stopWaitMs: 0 });
  return { service, project, killed };
}

test("selfPid にメインの pid を渡すと、束の中のコアのプロセス（Helper）は出さず、ターミナルから起こしたものは Kickoff の中として出す", async () => {
  const { service, project } = setup();
  const list = await service.list();
  assert.deepEqual(
    list.map((p) => [p.pid, p.ports, p.origin, p.project_id]),
    [[103, [3000], "kickoff", project.id]],
  );
});

test("コアのプロセス・メインは止めさせない（一覧にないものとして断る）。一覧のものは止める", async () => {
  const { service, killed } = setup();
  await assert.rejects(service.stop(CORE, "x"), /もう動いていないか/);
  await assert.rejects(service.stop(MAIN, "x"), /もう動いていないか/);
  assert.equal(await service.stop(103, "node node_modules/.bin/vite --port 3000"), true);
  assert.deepEqual(killed, [103]);
});
