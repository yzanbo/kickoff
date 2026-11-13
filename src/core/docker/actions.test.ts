import assert from "node:assert/strict";
import { test } from "node:test";
import type { DockerCompose, DockerContainer, DockerService } from "@shared/types";
import { planDockerAction, startedServices } from "./actions.js";

const ctr = (id: string, state: DockerContainer["state"] = "running"): DockerContainer => ({ id, name: id, image: "img", state, status: "", exit_code: null, health: null, ports: [], number: 1 });
const svc = (name: string, over: Partial<DockerService> = {}): DockerService => ({ name, image: "img", profiles: [], published: [], containers: [], oneoffs: [], mark: "none", running: 0, db_kind: null, ...over });
const compose = (over: Partial<DockerCompose> = {}): DockerCompose => ({
  key: "k",
  worktree_path: null,
  branch: "main",
  file: "compose.yaml",
  project_name: "app",
  created: true,
  services: [],
  config_error: null,
  config_changed: false,
  shares: [],
  start_blocked: null,
  down_blocked: null,
  operation: null,
  failure: null,
  ...over,
});
const upFiles = ["/r/app/compose.yaml", "/r/app/compose.override.yaml"];

test("planDockerAction: 作っていない compose のすべて起動は -f を付けた up -d（ファイルのフォルダで）", () => {
  const plan = planDockerAction({ compose: compose({ created: false, services: [svc("db")] }), upFiles, action: "start_all" });
  assert.deepEqual(plan.steps, [{ args: ["compose", "-p", "app", "-f", upFiles[0], "-f", upFiles[1], "up", "-d"], cwd: "/r/app", stream: true }]);
  assert.equal(plan.usesUp, true);
});

test("planDockerAction: 作ってあるものだけならすべて起動は start で、up は流さない（確かめも要らない）", () => {
  const plan = planDockerAction({ compose: compose({ services: [svc("db", { containers: [ctr("c1", "exited")] }), svc("tool", { profiles: ["tools"] })] }), upFiles, action: "start_all" });
  assert.deepEqual(plan.steps, [{ args: ["compose", "-p", "app", "start", "db"], cwd: "/", stream: false }]);
  assert.equal(plan.usesUp, false);
});

test("planDockerAction: 札付きのサービスの起動は --profile を付けてそのサービスだけ", () => {
  const plan = planDockerAction({ compose: compose({ services: [svc("adminer", { profiles: ["tools"] })] }), upFiles, action: "start", service: "adminer" });
  assert.deepEqual(plan.steps[0].args, ["compose", "-p", "app", "-f", upFiles[0], "-f", upFiles[1], "--profile", "tools", "up", "-d", "adminer"]);
});

test("planDockerAction: 同じ作業場所のほかの compose と同じ組なら、停止・再起動はコンテナの ID で。片付けは断る", () => {
  const c = compose({
    services: [svc("db", { containers: [ctr("c1"), ctr("c2", "exited")], oneoffs: [ctr("r1")] })],
    shares: [{ kind: "file", worktree_path: null, branch: null, file: "compose.e2e.yaml", other: null }],
    down_blocked: "同じ組です",
  });
  assert.deepEqual(planDockerAction({ compose: c, upFiles, action: "stop_all" }).steps[0].args, ["stop", "c1", "r1"]);
  assert.deepEqual(planDockerAction({ compose: c, upFiles, action: "restart_all" }).steps[0].args, ["restart", "c1", "c2"]);
  assert.throws(() => planDockerAction({ compose: c, upFiles, action: "down" }), /同じ組です/);
});

test("planDockerAction: ファイルがないと up の経路は断り、止めることはできる", () => {
  const c = compose({ start_blocked: "compose のファイルが見つかりません", services: [svc("db", { containers: [ctr("c1")] })] });
  assert.throws(() => planDockerAction({ compose: c, upFiles: [], action: "recreate" }), /見つかりません/);
  assert.deepEqual(planDockerAction({ compose: c, upFiles: [], action: "stop", service: "db" }).steps[0], { args: ["stop", "c1"], cwd: "/", stream: false });
});

test("planDockerAction: 一時停止中だけ再開、ほかの compose のコンテナは止めない", () => {
  const c = compose({ services: [svc("db", { containers: [ctr("c1", "paused"), ctr("c2")] })] });
  assert.deepEqual(planDockerAction({ compose: c, upFiles, action: "unpause", service: "db" }).steps[0].args, ["unpause", "c1"]);
  assert.throws(() => planDockerAction({ compose: c, upFiles, action: "stop_container", container: "zzz" }), /この compose のコンテナではありません/);
});

test("planDockerAction: 相手を止めて起動は相手を止め、ぶつかったサービスを作り直す。1 つのサービスの起動ならそこで終わり、相手がなければ断る", () => {
  const c = compose({ services: [svc("db", { published: [5432], containers: [ctr("c1", "exited")] }), svc("adminer", { profiles: ["tools"], published: [8080] }), svc("web", { published: [3000] })] });
  const conflict = (port: number, id: string) => ({ port, container_id: id, container_name: id, label: id });
  const one = planDockerAction({ compose: c, upFiles, action: "stop_others_and_start", retry: { action: "start", service: "adminer", conflicts: [conflict(8080, "x1")] } });
  assert.deepEqual(one.steps[0].args, ["stop", "x1"]);
  assert.deepEqual(one.steps.length, 2);
  assert.deepEqual(one.steps[1].args.slice(-7), ["--profile", "tools", "up", "-d", "--no-deps", "--force-recreate", "adminer"]);
  const all = planDockerAction({ compose: c, upFiles, action: "stop_others_and_start", retry: { action: "start_all", service: null, conflicts: [conflict(5432, "x1"), conflict(5432, "x2")] } });
  assert.deepEqual(all.steps[0].args, ["stop", "x1", "x2"]);
  assert.deepEqual(all.steps[1].args.slice(-5), ["up", "-d", "--no-deps", "--force-recreate", "db"]);
  assert.ok(all.steps.length > 2, "残りはすべて起動をやり直す");
  assert.throws(() => planDockerAction({ compose: c, upFiles, action: "stop_others_and_start", retry: { action: "start_all", service: null, conflicts: [] } }), /止める相手がありません/);
});

test("planDockerAction: サービスを指した作り直しはそのサービスだけ --force-recreate（札付きは札を付けて）", () => {
  const c = compose({ services: [svc("web", { published: [8080], containers: [ctr("c1")] }), svc("adminer", { profiles: ["tools"], containers: [ctr("c2")] })] });
  assert.deepEqual(planDockerAction({ compose: c, upFiles, action: "recreate", service: "web" }).steps[0].args.slice(-5), ["up", "-d", "--no-deps", "--force-recreate", "web"]);
  assert.deepEqual(planDockerAction({ compose: c, upFiles, action: "recreate", service: "adminer" }).steps[0].args.slice(-7), ["--profile", "tools", "up", "-d", "--no-deps", "--force-recreate", "adminer"]);
  assert.deepEqual(planDockerAction({ compose: c, upFiles, action: "recreate" }).steps[0].args.slice(-2), ["up", "-d"]);
});

test("planDockerAction: 相手を止めて起動で作り直すのは、元の操作で起動しようとしたサービスのうちぶつかったものだけ（同じポートの札付きは起動しない）", () => {
  // E2E 用の db（札付き）が開発用の db と同じ 5432 を使う
  const c = compose({
    services: [svc("db", { published: [5432], containers: [ctr("c1", "exited")] }), svc("web", { published: [3000] }), svc("db-e2e", { profiles: ["e2e"], published: [5432] })],
  });
  const conflict = { port: 5432, container_id: "x1", container_name: "x1", label: "x1" };
  const all = planDockerAction({ compose: c, upFiles, action: "stop_others_and_start", retry: { action: "start_all", service: null, conflicts: [conflict] } });
  assert.deepEqual(all.steps[1].args.slice(-5), ["up", "-d", "--no-deps", "--force-recreate", "db"]);
  assert.ok(!all.steps.some((s) => s.args.includes("--profile") || s.args.includes("db-e2e")), "札付きは作り直さない・起動しない");
  // 札付きの行の［起動］でぶつかったなら、その札付きだけ（札を付けて）
  const e2e = planDockerAction({ compose: c, upFiles, action: "stop_others_and_start", retry: { action: "start", service: "db-e2e", conflicts: [conflict] } });
  assert.equal(e2e.steps.length, 2);
  assert.deepEqual(e2e.steps[1].args.slice(-7), ["--profile", "e2e", "up", "-d", "--no-deps", "--force-recreate", "db-e2e"]);
  // 行の［起動］ならそのサービスだけ
  const one = planDockerAction({ compose: c, upFiles, action: "stop_others_and_start", retry: { action: "start", service: "db", conflicts: [conflict] } });
  assert.deepEqual(one.steps[1].args.slice(-5), ["up", "-d", "--no-deps", "--force-recreate", "db"]);
});

test("startedServices: サービスの行ならそのサービス（札付きでも）、指さなければ札のないサービス", () => {
  const c = compose({ services: [svc("db"), svc("adminer", { profiles: ["tools"] })] });
  assert.deepEqual(startedServices(c, null).map((s) => s.name), ["db"]);
  assert.deepEqual(startedServices(c, "adminer").map((s) => s.name), ["adminer"]);
  assert.deepEqual(startedServices(c, "nothing"), []);
});
