import assert from "node:assert/strict";
import { test } from "node:test";
import type { DockerCompose, DockerContainer, DockerService } from "@shared/types";
import { planDockerAction } from "./actions.js";

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
