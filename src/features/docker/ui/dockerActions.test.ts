import assert from "node:assert/strict";
import { test } from "vitest";
import type { DockerCompose, DockerContainer, DockerServiceInfo } from "@shared/docker/types";
import { DOCKER_DB_NO_PORT } from "@shared/docker/types";
import { composeActions, oneoffActions, primaryAction, serviceActions, specOf } from "./dockerActions";

const ctr = (over: Partial<DockerContainer> = {}): DockerContainer => ({ id: "c", name: "c", image: "i", state: "running", status: "", exit_code: null, health: null, ports: [], number: 1, ...over });
const svc = (over: Partial<DockerServiceInfo> = {}): DockerServiceInfo => ({ name: "db", image: "postgres", profiles: [], published: [], containers: [], oneoffs: [], mark: "none", running: 0, db_kind: null, ...over });
const compose = (over: Partial<DockerCompose> = {}): DockerCompose => ({
  key: "k",
  worktree_path: null,
  branch: null,
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
const idle = { busy: false, dbWaiting: false };

test("serviceActions: 全部動いているとき起動は押せず、主な操作は停止（ボタンとメニューが同じ表を読む）", () => {
  const s = svc({ containers: [ctr(), ctr()], running: 2, mark: "running" });
  const specs = serviceActions(s, compose(), idle);
  assert.equal(specOf(specs, "start")?.disabled, true);
  assert.equal(specOf(specs, "stop")?.disabled, false);
  assert.equal(primaryAction(s).id, "stop");
  // 一部だけ動いていれば起動も押せる
  assert.equal(specOf(serviceActions(svc({ containers: [ctr(), ctr({ state: "exited" })], running: 1, mark: "running" }), compose(), idle), "start")?.disabled, false);
});

test("serviceActions: 作っていないサービスは compose の起動を止める理由で起動できない・操作の最中は全部押せない", () => {
  const specs = serviceActions(svc(), compose({ start_blocked: "ポートが空いていません" }), idle);
  assert.deepEqual(specOf(specs, "start"), { id: "start", label: "起動", disabled: true, title: "ポートが空いていません" });
  const busy = serviceActions(svc({ containers: [ctr()], running: 1, mark: "running" }), compose(), { busy: true, dbWaiting: false });
  assert.deepEqual(busy.filter((s) => s.disabled).map((s) => s.id), ["start", "stop", "restart"]);
});

test("serviceActions: 一時停止なら再開が先頭・DB の「DB で開く」は Mac に出すポートと起動待ちで止める", () => {
  assert.equal(serviceActions(svc({ mark: "paused", containers: [ctr({ state: "paused" })] }), compose(), idle)[0].id, "unpause");
  assert.equal(specOf(serviceActions(svc({ db_kind: "postgres" }), compose(), idle), "db")?.title, DOCKER_DB_NO_PORT);
  assert.equal(specOf(serviceActions(svc({ db_kind: "postgres", published: [5432] }), compose(), { busy: false, dbWaiting: true }), "db")?.title, "db の起動を待っています");
  assert.equal(specOf(serviceActions(svc(), compose(), idle), "db"), undefined);
});

test("composeActions: 何も動いていなければ停止・再起動を押せず、作っていなければ片付けを押せない・設定が変わったら作り直し", () => {
  const specs = composeActions(compose({ created: false, services: [svc()] }));
  assert.deepEqual(specs.filter((s) => s.disabled).map((s) => s.id), ["stop_all", "restart_all", "down"]);
  assert.equal(specOf(specs, "recreate"), undefined);
  assert.equal(specOf(composeActions(compose({ config_changed: true })), "recreate")?.label, "作り直して起動…");
  assert.equal(specOf(composeActions(compose({ file: null })), "file")?.disabled, true);
});

test("oneoffActions: 止まっているものは停止を押せない", () => {
  assert.equal(specOf(oneoffActions(ctr({ state: "exited" }), false), "stop")?.disabled, true);
  assert.equal(specOf(oneoffActions(ctr(), false), "stop")?.disabled, false);
});
