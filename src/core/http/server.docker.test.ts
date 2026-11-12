// Docker タブの API（偽の docker を PATH の代わりに渡す）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { DockerList, DockerLogEvent } from "@shared/types";
import { DockerLogSession } from "../docker/logs.js";
import { setup } from "../testing/testServer.js";
import { until } from "../testing/testCore.js";

const ps = (rows: Record<string, unknown>[]) => rows.map((r) => JSON.stringify({ ports: "", files: "", oneoff: "False", number: "1", hash: "", status: "Up 1 hour", image: "img", ...r })).join("\n") + "\n";
const config = (name: string, services: Record<string, unknown>) => JSON.stringify({ name, services });

/** プロジェクトに compose.yaml を置き、設定の答えを決める */
function withCompose(s: ReturnType<typeof setup>, extra: { match: string; stdout?: string; stderr?: string; code?: number; hang?: boolean }[] = [], containers: Record<string, unknown>[] = []) {
  fs.writeFileSync(path.join(s.project.repo_path, "compose.yaml"), "services: {}\n");
  s.dockerFake.set([
    ...extra,
    { match: "config --hash", stdout: "db h1\nredis h2\n" },
    { match: "config --format json", stdout: config("app", { db: { image: "postgres:16", ports: [{ published: "5432" }] }, redis: { image: "redis:7" }, adminer: { image: "adminer", profiles: ["tools"] } }) },
    { match: "ps -a", stdout: ps(containers) },
  ]);
}

const list = async (s: ReturnType<typeof setup>) => (await s.call("GET", `/api/projects/${s.project.id}/docker`)).body as DockerList;

test("Docker: docker が入っていない・エンジンが止まっている", async () => {
  const s = setup();
  s.dockerFake.missing = true;
  assert.equal((await list(s)).engine, "missing");
  s.dockerFake.missing = false;
  s.dockerFake.set([{ match: "version", code: 1, stderr: "Cannot connect to the Docker daemon" }]);
  const stopped = await list(s);
  assert.equal(stopped.engine, "stopped");
  assert.deepEqual(stopped.starter, { kind: "open", app: "OrbStack", label: "OrbStack を開く" });
});

test("Docker: 一覧は作っていない compose・作ったサービス・札付き・ほかのプロジェクトの数", async () => {
  const s = setup();
  withCompose(s, [], [
    { id: "c1", name: "app-db-1", state: "running", project: "app", service: "db", dir: s.project.repo_path, files: path.join(s.project.repo_path, "compose.yaml"), ports: "0.0.0.0:5432->5432/tcp", hash: "h1" },
    { id: "x1", name: "other-1", state: "running", project: "other", service: "web", dir: "/somewhere/else", ports: "0.0.0.0:8080->80/tcp" },
  ]);
  const l = await list(s);
  assert.equal(l.engine, "ok");
  assert.equal(l.composes.length, 1);
  const [c] = l.composes;
  assert.equal(c.file, "compose.yaml");
  assert.equal(c.project_name, "app");
  assert.equal(c.created, true);
  assert.equal(c.config_changed, false);
  assert.deepEqual(
    c.services.map((x) => [x.name, x.mark]),
    [
      ["db", "running"],
      ["redis", "none"],
      ["adminer", "none"],
    ],
  );
  assert.deepEqual(c.services[0].containers[0].ports.map((p) => p.host_port), [5432]);
  assert.deepEqual(l.others, [{ name: "other-1", ports: [8080] }]);
});

test("Docker: すべて起動は作ってあるものを start（/ で）、作っていないものだけ up -d --no-deps。札付きは含めない", async () => {
  const s = setup();
  withCompose(s, [], [{ id: "c1", name: "app-db-1", state: "exited", status: "Exited (0) 1 minute ago", project: "app", service: "db", dir: s.project.repo_path, files: path.join(s.project.repo_path, "compose.yaml") }]);
  const [c] = (await list(s)).composes;
  s.dockerFake.clearCalls();
  const res = await s.call("POST", `/api/projects/${s.project.id}/docker/actions`, { action: "start_all", compose: c.key });
  assert.equal(res.status, 202);
  // 始めたあとの一覧を返す（画面がそのまま出す）
  assert.equal((res.body as DockerList).composes[0].key, c.key);
  await until(() => s.dockerFake.calls().some((x) => x.args.includes("up")));
  await until(() => !s.docker["operations"].size);
  const calls = s.dockerFake.calls().filter((x) => x.args[0] === "compose" && !x.args.includes("config"));
  assert.deepEqual(calls[0], { args: ["compose", "-p", "app", "start", "db"], cwd: "/" });
  assert.deepEqual(calls[1].args, ["compose", "-p", "app", "-f", path.join(fs.realpathSync(s.project.repo_path), "compose.yaml"), "up", "-d", "--no-deps", "redis"]);
});

test("Docker: 別の作業場所と同じ組になる起動は 409 で確かめ、confirm_shared なら流す", async () => {
  const s = setup();
  withCompose(s, [], [{ id: "o1", name: "app-db-1", state: "running", project: "app", service: "db", dir: "/elsewhere/app" }]);
  const [c] = (await list(s)).composes;
  assert.equal(c.created, false);
  assert.equal(c.shares[0].other, "app");
  const denied = await s.call("POST", `/api/projects/${s.project.id}/docker/actions`, { action: "start_all", compose: c.key });
  assert.equal(denied.status, 409);
  assert.equal(denied.body.code, "docker_shared_project");
  assert.equal(denied.body.error, "ほかのプロジェクト（app）の組と同じ名前（app）です。起動すると、そちらのコンテナが作り直されます");
  const ok = await s.call("POST", `/api/projects/${s.project.id}/docker/actions`, { action: "start_all", compose: c.key, confirm_shared: true });
  assert.equal(ok.status, 202);
});

test("Docker: 失敗は標準エラーの最後の行と流し直すコマンドを残し、［×］で消す。同じ compose の操作は 1 つずつ", async () => {
  const s = setup();
  withCompose(s, [{ match: "up -d", code: 1, stderr: "pulling...\nError: image not found\n" }]);
  const [c] = (await list(s)).composes;
  await s.call("POST", `/api/projects/${s.project.id}/docker/actions`, { action: "start_all", compose: c.key });
  await until(() => !s.docker["operations"].size);
  const failed = (await list(s)).composes[0].failure;
  assert.match(failed?.message ?? "", /image not found/);
  assert.match(failed?.command ?? "", /^docker compose -p app -f .* up -d$/);
  const dismissed = await s.call("POST", `/api/projects/${s.project.id}/docker/actions`, { action: "dismiss", compose: c.key });
  assert.equal(dismissed.status, 204);
  assert.equal((await list(s)).composes[0].failure, null);
});

test("Docker: 流れ続ける up -d は［中止］で止まり、失敗にしない", async () => {
  const s = setup();
  withCompose(s, [{ match: "up -d", hang: true }]);
  const [c] = (await list(s)).composes;
  await s.call("POST", `/api/projects/${s.project.id}/docker/actions`, { action: "start_all", compose: c.key });
  const busy = (await list(s)).composes[0].operation;
  assert.equal(busy?.action, "start_all");
  assert.equal(busy?.cancellable, true);
  const again = await s.call("POST", `/api/projects/${s.project.id}/docker/actions`, { action: "start_all", compose: c.key });
  assert.equal(again.status, 409);
  await until(() => s.dockerFake.calls().some((x) => x.args.includes("up")));
  assert.equal((await s.call("POST", `/api/projects/${s.project.id}/docker/actions`, { action: "cancel", compose: c.key })).status, 204);
  await until(() => !s.docker["operations"].size);
  const after = (await list(s)).composes[0];
  assert.equal(after.operation, null);
  assert.equal(after.failure, null);
});

test("Docker: すべて停止は -p で / から、片付けは使い捨てを消してから down", async () => {
  const s = setup();
  const file = path.join(s.project.repo_path, "compose.yaml");
  withCompose(s, [], [
    { id: "c1", name: "app-db-1", state: "running", project: "app", service: "db", dir: s.project.repo_path, files: file },
    { id: "r1", name: "app-db-run-1", state: "running", project: "app", service: "db", dir: s.project.repo_path, files: file, oneoff: "True" },
  ]);
  const [c] = (await list(s)).composes;
  s.dockerFake.clearCalls();
  await s.call("POST", `/api/projects/${s.project.id}/docker/actions`, { action: "stop_all", compose: c.key });
  await until(() => !s.docker["operations"].size);
  await s.call("POST", `/api/projects/${s.project.id}/docker/actions`, { action: "down", compose: c.key });
  await until(() => !s.docker["operations"].size);
  const ran = s.dockerFake
    .calls()
    .filter((x) => !["version", "context", "ps"].includes(x.args[0]) && !x.args.includes("config"))
    .map((x) => `${x.cwd} ${x.args.join(" ")}`);
  assert.deepEqual(ran, ["/ compose -p app stop", "/ stop r1", "/ rm -f r1", "/ compose -p app down"]);
});

test("Docker: 見ていますで docker events を立てる。どこからも見られなくなったら止める", async () => {
  const s = setup();
  await s.call("POST", `/api/projects/${s.project.id}/docker/watch`);
  await until(() => s.dockerFake.calls().some((x) => x.args[0] === "events"));
  const events = s.docker["events"];
  assert.equal(events.running, true);
  events.stop();
  assert.equal(events.running, false);
});

test("Docker: ログのさらに前を読むは until より前の 500 行を時刻の順に（標準エラーも）。ほかの compose のコンテナは 404", async () => {
  const s = setup();
  const file = path.join(s.project.repo_path, "compose.yaml");
  const id = "abcdef0123456789";
  withCompose(
    s,
    [{ match: "logs --timestamps --until", stdout: "2026-11-13T01:00:00.000000002Z b\n2026-11-13T01:00:05Z same\n", stderr: "2026-11-13T01:00:00.1Z err\n" }],
    [{ id, name: "app-db-1", state: "exited", status: "Exited (1) 1 minute ago", project: "app", service: "db", dir: s.project.repo_path, files: file }],
  );
  const [c] = (await list(s)).composes;
  const url = (container: string) => `/api/projects/${s.project.id}/docker/logs/before?compose=${encodeURIComponent(c.key)}&container=${container}&until=2026-11-13T01:00:05.000000000Z`;
  const res = await s.call("GET", url(id));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.lines, [
    { ts: "2026-11-13T01:00:00.000000002Z", text: "b" },
    { ts: "2026-11-13T01:00:00.100000000Z", text: "err" },
  ]);
  assert.ok(s.dockerFake.calls().some((x) => x.args.join(" ") === `logs --timestamps --until 2026-11-13T01:00:05.000000000Z --tail 500 ${id}`));
  assert.equal((await s.call("GET", url("ffffffffffff"))).status, 404);
  assert.equal((await s.call("GET", url("not-hex"))).status, 400);
});

test("Docker: ログの流れは最新の 500 行を追い、止まったら区切りを知らせる", async () => {
  const s = setup();
  s.dockerFake.set([{ match: "logs -f", stdout: "2026-11-13T01:00:00Z hello\n", hang: true }]);
  const events: DockerLogEvent[] = [];
  let running = true;
  const source = () => [{ container: "abcdef012345", service: "web", label: "web", running, exit_code: running ? null : 1 }];
  const session = new DockerLogSession(s.docker.cli, async () => source(), (e) => events.push(e));
  try {
    await session.sync();
    await until(() => events.some((e) => e.type === "lines"));
    assert.deepEqual(events[0], { type: "sources", sources: source() });
    assert.deepEqual(events.find((e) => e.type === "lines"), { type: "lines", container: "abcdef012345", lines: [{ ts: "2026-11-13T01:00:00.000000000Z", text: "hello" }] });
    assert.ok(s.dockerFake.calls().some((x) => x.args.join(" ") === "logs -f --timestamps --tail 500 abcdef012345"));
    running = false;
    await session.sync();
    const stopped = events.find((e) => e.type === "stopped");
    assert.equal(stopped?.type === "stopped" && stopped.exit_code, 1);
  } finally {
    session.close();
  }
});

test("Docker: ログの流れは、作り直された（同じ札の新しいコンテナ）ときも起動の区切りを入れて最新の 500 行から追う", async () => {
  const s = setup();
  s.dockerFake.set([{ match: "logs -f", stdout: "2026-11-13T01:00:00Z hello\n", hang: true }]);
  const events: DockerLogEvent[] = [];
  let id = "aaaaaaaaaaaa";
  const source = () => [{ container: id, service: "db", label: "db", running: true, exit_code: null }];
  const session = new DockerLogSession(s.docker.cli, async () => source(), (e) => events.push(e));
  try {
    await session.sync();
    // 初めて開いたときは区切りを入れない
    assert.equal(events.some((e) => e.type === "started"), false);
    id = "bbbbbbbbbbbb";
    await session.sync();
    assert.ok(events.some((e) => e.type === "started" && e.container === "bbbbbbbbbbbb"));
    await until(() => s.dockerFake.calls().some((x) => x.args.join(" ") === "logs -f --timestamps --tail 500 bbbbbbbbbbbb"));
  } finally {
    session.close();
  }
});

test("Docker: ポートで失敗したら相手を全部残し、［相手を止めて起動］で相手を止めてから同じ起動をやり直す", async () => {
  const s = setup();
  withCompose(s, [{ match: "up -d", code: 1, stderr: "Error response from daemon: Bind for 0.0.0.0:5432 failed: port is already allocated\n" }], [
    { id: "x1", name: "else-db-1", state: "running", project: "else", service: "db", dir: "/somewhere/else", ports: "0.0.0.0:5432->5432/tcp" },
    { id: "x2", name: "kickoff-dbtest-pg", state: "running", ports: "127.0.0.1:5432->5432/tcp" },
  ]);
  const [c] = (await list(s)).composes;
  await s.call("POST", `/api/projects/${s.project.id}/docker/actions`, { action: "start_all", compose: c.key });
  await until(() => !s.docker["operations"].size);
  const failure = (await list(s)).composes[0].failure;
  assert.deepEqual(
    failure?.conflicts.map((x) => [x.port, x.container_id, x.label]),
    [
      [5432, "x1", "else（ほかのプロジェクト）の db"],
      [5432, "x2", "kickoff-dbtest-pg（compose の外で作ったコンテナ）"],
    ],
  );
  // 作り直しは通り、そのあとのすべて起動はまた失敗する
  const containers = [{ id: "x1", name: "else-db-1", state: "running", project: "else", service: "db", dir: "/somewhere/else", ports: "0.0.0.0:5432->5432/tcp" }];
  withCompose(s, [{ match: "--force-recreate", code: 0 }, { match: "up -d", code: 1, stderr: "Bind for 0.0.0.0:5432 failed: port is already allocated\n" }], containers);
  s.dockerFake.clearCalls();
  const res = await s.call("POST", `/api/projects/${s.project.id}/docker/actions`, { action: "stop_others_and_start", compose: c.key });
  assert.equal(res.status, 202);
  await until(() => !s.docker["operations"].size);
  const ran = s.dockerFake.calls().filter((x) => x.args[0] === "stop" || x.args.includes("up")).map((x) => x.args.join(" "));
  assert.equal(ran[0], "stop x1 x2");
  // ぶつかったサービスは作り直す（ポートで失敗したコンテナは、あとで起動してもポートを出さないため）。そのあと元の起動をやり直す
  assert.match(ran[1], /up -d --no-deps --force-recreate db$/);
  assert.match(ran[2], /up -d$/);
  // やり直しも失敗したら、元の操作（すべて起動）として残る（もう一度［相手を止めて起動］できる）
  assert.equal((await list(s)).composes[0].failure?.action, "start_all");
});

test("Docker: 相手がいないときの［相手を止めて起動］は 400", async () => {
  const s = setup();
  withCompose(s);
  const [c] = (await list(s)).composes;
  assert.equal((await s.call("POST", `/api/projects/${s.project.id}/docker/actions`, { action: "stop_others_and_start", compose: c.key })).status, 400);
});

test("Docker: 静かなぶつかり（Docker の外のプロセスが同じポート）を lsof で見つけ、Homebrew のサービスなら止められる", async () => {
  const s = setup();
  const file = path.join(s.project.repo_path, "compose.yaml");
  withCompose(s, [], [{ id: "c1", name: "app-db-1", state: "running", project: "app", service: "db", dir: s.project.repo_path, files: file, ports: "0.0.0.0:5432->5432/tcp", hash: "h1" }]);
  s.portsFake.lsof = [
    "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME",
    "OrbStack\\x20Helper 900 me 10u IPv4 0x1 0t0 TCP *:5432 (LISTEN)",
    "postgres 123 me 7u IPv4 0x2 0t0 TCP 127.0.0.1:5432 (LISTEN)",
  ].join("\n");
  s.portsFake.brewServices = JSON.stringify([{ name: "postgresql@16", running: true, pid: 123 }]);
  const l = await list(s);
  assert.deepEqual(l.silent, { c1: [{ port: 5432, address: "127.0.0.1:5432", process: "postgres", pid: 123, brew_service: "postgresql@16" }] });
  assert.equal((await s.call("POST", `/api/projects/${s.project.id}/docker/brew-stop`, { name: "redis" })).status, 400);
  const res = await s.call("POST", `/api/projects/${s.project.id}/docker/brew-stop`, { name: "postgresql@16" });
  assert.equal(res.status, 200);
  assert.match(res.body.message, /brew services start postgresql@16/);
  assert.deepEqual(s.portsFake.brewStopped, ["postgresql@16"]);
});
