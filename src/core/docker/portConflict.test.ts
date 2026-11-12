import assert from "node:assert/strict";
import { test } from "node:test";
import type { RawContainer } from "./parse.js";
import { allocatedPortOf, brewServicePids, conflictLabel, parseLsof, portConflictsOf, silentConflictsOf } from "./portConflict.js";

const container = (over: Partial<RawContainer>): RawContainer => ({
  id: "c1",
  name: "c1",
  image: "img",
  state: "running",
  status: "Up",
  ports: "",
  project: null,
  service: null,
  dir: null,
  files: [],
  oneoff: false,
  number: 1,
  hash: null,
  ...over,
});

test("allocatedPortOf: Docker 同士（アドレスは決め打ちしない）と、Docker の外のプロセスが先に待っていたとき", () => {
  assert.equal(allocatedPortOf("Error response from daemon: ... Bind for 0.0.0.0:18082 failed: port is already allocated"), 18082);
  assert.equal(allocatedPortOf("Bind for 127.0.0.1:5432 failed: port is already allocated"), 5432);
  assert.equal(allocatedPortOf("Bind for [::]:6379 failed: port is already allocated"), 6379);
  assert.equal(allocatedPortOf("ports are not available: exposing port TCP 0.0.0.0:5432 -> 0.0.0.0:0: listen tcp 0.0.0.0:5432: bind: address already in use"), 5432);
  assert.equal(allocatedPortOf("pull access denied"), null);
});

test("portConflictsOf: compose のポートを出している、ほかの動いているコンテナを全部（止まっているもの・自分のものは除く）", () => {
  const list = [
    container({ id: "a", name: "main-db-1", ports: "0.0.0.0:5432->5432/tcp, :::5432->5432/tcp" }),
    container({ id: "b", name: "main-redis-1", ports: "0.0.0.0:6379->6379/tcp" }),
    container({ id: "c", name: "old", state: "exited", ports: "" }),
    container({ id: "d", name: "mine", ports: "0.0.0.0:6379->6379/tcp" }),
    container({ id: "e", name: "web", ports: "0.0.0.0:8080->80/tcp" }),
  ];
  const got = portConflictsOf([6379, 5432, 3000], list, (c) => c.id === "d", (c) => `相手 ${c.name}`);
  assert.deepEqual(got, [
    { port: 5432, container_id: "a", container_name: "main-db-1", label: "相手 main-db-1" },
    { port: 6379, container_id: "b", container_name: "main-redis-1", label: "相手 main-redis-1" },
  ]);
});

const LSOF = `COMMAND              PID  USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
OrbStack\\x20Helper 95847 zanbo  100u  IPv4 0x9e8c6cac5bb13a57      0t0  TCP *:5432 (LISTEN)
OrbStack\\x20Helper 95847 zanbo  134u  IPv6 0xdbcdd02dabd8bc38      0t0  TCP *:5432 (LISTEN)
postgres            123 zanbo    7u  IPv4 0x1                     0t0  TCP 127.0.0.1:5432 (LISTEN)
postgres            123 zanbo    8u  IPv6 0x2                     0t0  TCP [::1]:5432 (LISTEN)
OrbStack\\x20Helper 95847 zanbo  101u  IPv4 0x3                   0t0  TCP *:6379 (LISTEN)
Python              555 zanbo    3u  IPv4 0x4                     0t0  TCP 127.0.0.1:8000 (LISTEN)
`;

test("parseLsof: 名前の \\x20 を戻し、アドレスとポートを読む", () => {
  const sockets = parseLsof(LSOF);
  assert.equal(sockets.length, 6);
  assert.deepEqual(sockets[0], { process: "OrbStack Helper", pid: 95847, address: "*:5432", port: 5432 });
  assert.deepEqual(sockets[2], { process: "postgres", pid: 123, address: "127.0.0.1:5432", port: 5432 });
  assert.equal(sockets[3].address, "[::1]:5432");
});

test("silentConflictsOf: PID が 2 つ以上でエンジンでないものだけ。エンジン 1 つだけ・コンテナの出していないポートは出さない。Homebrew のサービスは名前を添える", () => {
  const sockets = parseLsof(LSOF);
  assert.deepEqual(silentConflictsOf([5432, 6379], sockets, new Map([[123, "postgresql@16"]])), [
    { port: 5432, address: "127.0.0.1:5432", process: "postgres", pid: 123, brew_service: "postgresql@16" },
  ]);
  assert.deepEqual(silentConflictsOf([6379], sockets), []);
  // 知らないエンジンでも、待つのが 1 つだけなら出さない
  assert.deepEqual(silentConflictsOf([8000], sockets), []);
});

test("brewServicePids: 動いているサービスの PID → 名前（形が違えば空）", () => {
  const out = JSON.stringify([
    { name: "postgresql@16", running: true, pid: 123 },
    { name: "redis", running: false, pid: null },
  ]);
  assert.deepEqual([...brewServicePids(out)], [[123, "postgresql@16"]]);
  assert.equal(brewServicePids("not json").size, 0);
});

test("conflictLabel: このプロジェクトの作業場所・ほかのプロジェクト・compose の外", () => {
  const composes = new Map([
    ["a", { worktree_path: null, branch: "main" }],
    ["b", { worktree_path: "/r/app-worktrees/feat-x", branch: "feat-x" }],
  ]);
  const of = (id: string) => composes.get(id);
  assert.equal(conflictLabel(container({ id: "a", service: "db", project: "app" }), of), "本体 | main の db");
  assert.equal(conflictLabel(container({ id: "b", service: "db", project: "app" }), of), "WT | feat-x の db");
  assert.equal(conflictLabel(container({ id: "x", service: "db", project: "other", dir: "/w/other" }), of), "other（ほかのプロジェクト）の db");
  assert.equal(conflictLabel(container({ id: "y", name: "kickoff-dbtest-pg" }), of), "kickoff-dbtest-pg（compose の外で作ったコンテナ）");
});
