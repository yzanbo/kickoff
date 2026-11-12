import assert from "node:assert/strict";
import { test } from "node:test";
import type { DockerContainer, DockerService } from "@shared/types";
import { oneoffSummary, othersTip, servicePorts, serviceStatusText, shareText, shellCommand, workplaceText } from "./dockerView";

const ctr = (over: Partial<DockerContainer> = {}): DockerContainer => ({ id: "c", name: "c", image: "i", state: "running", status: "", exit_code: null, health: null, ports: [], number: 1, ...over });
const svc = (over: Partial<DockerService> = {}): DockerService => ({ name: "db", image: "postgres", profiles: [], published: [], containers: [], oneoffs: [], mark: "none", running: 0, db_kind: null, ...over });

test("workplaceText: 本体とワークツリー", () => {
  assert.equal(workplaceText(null, "main"), "本体 | main");
  assert.equal(workplaceText(null, null), "本体");
  assert.equal(workplaceText("/r/app-worktrees/feat-x", "feat-x"), "WT | feat-x");
});

test("serviceStatusText: 作っていない・札付き・数を増やした・異常に終了", () => {
  assert.equal(serviceStatusText(svc()), "作っていない");
  assert.equal(serviceStatusText(svc({ profiles: ["tools"] })), "tools のときだけ");
  assert.equal(serviceStatusText(svc({ containers: [ctr(), ctr({ state: "exited" }), ctr()], running: 2, mark: "running" })), "×3（2 個動いている）");
  assert.equal(serviceStatusText(svc({ containers: [ctr({ state: "exited", exit_code: 1 })], mark: "failed" })), "止まっている（exit 1）");
  assert.equal(serviceStatusText(svc({ containers: [ctr({ health: "unhealthy" })], mark: "failed" })), "unhealthy");
  assert.equal(serviceStatusText(svc({ containers: [ctr({ state: "created" })], mark: "created" })), "未起動");
});

test("servicePorts: 動いているコンテナのポートだけを重ねずに", () => {
  const p = (n: number) => ({ host_ip: "0.0.0.0", host_port: n, container_port: n, protocol: "tcp" });
  assert.deepEqual(servicePorts(svc({ containers: [ctr({ ports: [p(5432)] }), ctr({ ports: [p(5432), p(5433)] }), ctr({ state: "exited", ports: [p(9)] })] })), [5432, 5433]);
});

test("oneoffSummary・othersTip・shellCommand", () => {
  assert.equal(oneoffSummary([ctr(), ctr({ state: "exited" })]), "使い捨て 2 個（1 個動いている）");
  assert.equal(oneoffSummary([ctr({ state: "exited" })]), "使い捨て 1 個");
  assert.equal(othersTip([{ name: "a", ports: [80, 443] }, { name: "b", ports: [] }]), "a（:80 :443）\nb");
  assert.match(shellCommand("abc"), /^docker exec -it abc sh -c /);
});

test("shareText: 作業場所・ほかのプロジェクト・同じ作業場所のほかの compose", () => {
  const c = { project_name: "app", file: "compose.yaml" };
  assert.equal(shareText({ kind: "workplace", worktree_path: null, branch: "main", file: null, other: null }, c), "本体 | main と同じ組（app）です。コンテナとデータ（ボリューム）を共有しています");
  assert.match(shareText({ kind: "workplace", worktree_path: null, branch: null, file: null, other: "app" }, c), /^ほかのプロジェクト（app）と同じ組/);
  assert.match(shareText({ kind: "file", worktree_path: null, branch: null, file: "compose.e2e.yaml", other: null }, c), /分けるには compose\.e2e\.yaml に name: を書きます$/);
});
