// Docker タブの API（偽の docker を PATH の代わりに渡す）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { DockerList } from "@shared/types";
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
  assert.match(denied.body.error, /作り直されます/);
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
