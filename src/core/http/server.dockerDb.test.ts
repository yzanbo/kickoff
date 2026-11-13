// Docker タブの「DB で開く」（段階 2）: 行き先の API と、Docker タブの案（docker:…）の取り込み（偽の docker を PATH の代わりに渡す）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { DOCKER_DB_NO_PORT, type DbConnection, type DockerDbTarget, type DockerList } from "@shared/types";
import { gitRepo } from "../testing/gitRepo.js";
import { setup } from "../testing/testServer.js";

const pg = { image: "postgres:16", environment: { POSTGRES_USER: "app", POSTGRES_PASSWORD: "secret", POSTGRES_DB: "app_dev" }, ports: [{ target: 5432, published: "5433" }] };

/** プロジェクトに compose.yaml を置き、db（ポートを出す）・hidden（出さない）・redis の設定を答える。見出しのキーを返す */
async function withDbCompose(s: ReturnType<typeof setup>) {
  fs.writeFileSync(path.join(s.project.repo_path, "compose.yaml"), "services: {}\n");
  const { ports: _p, ...hidden } = pg;
  s.dockerFake.set([{ match: "config --format json", stdout: JSON.stringify({ name: "app", services: { db: pg, hidden, redis: { image: "redis:7" } } }) }]);
  const list = (await s.call("GET", `/api/projects/${s.project.id}/docker`)).body as DockerList;
  return list.composes[0].key;
}

const target = async (s: ReturnType<typeof setup>, compose: string, service: string) =>
  s.call("GET", `/api/projects/${s.project.id}/docker/db?compose=${encodeURIComponent(compose)}&service=${service}`);

test("Docker の DB で開く: 登録していなければ取り込みの案（パスワードは返さない）、ポートを出していなければ押せない理由", async () => {
  const s = setup();
  const compose = await withDbCompose(s);
  const res = await target(s, compose, "db");
  assert.equal(res.status, 200);
  const body = res.body as DockerDbTarget;
  assert.equal(body.connection_id, null);
  assert.equal(body.blocked, null);
  assert.ok(body.candidate);
  assert.match(body.candidate.key, /^docker:db:/);
  assert.equal(body.candidate.host, "localhost");
  assert.equal(body.candidate.port, 5433);
  assert.equal(body.candidate.database, "app_dev");
  assert.equal(body.candidate.has_password, true);
  assert.ok(!JSON.stringify(body).includes("secret"));

  assert.deepEqual((await target(s, compose, "hidden")).body, { connection_id: null, candidate: null, blocked: DOCKER_DB_NO_PORT });
  assert.equal((await target(s, compose, "redis")).status, 400);
  assert.equal((await target(s, "nothing", "db")).status, 404);
});

test("Docker の DB で開く: 案の key で取り込むと作られ（パスワードも compose から）、次からはその接続を指す", async () => {
  const s = setup();
  const compose = await withDbCompose(s);
  const { candidate } = (await target(s, compose, "db")).body as DockerDbTarget;
  assert.ok(candidate);
  const created = await s.call("POST", `/api/projects/${s.project.id}/db-connections/import`, { items: [{ key: candidate.key, name: candidate.name, environment: "local" }] });
  assert.equal(created.status, 201);
  const [conn] = created.body as DbConnection[];
  assert.equal(conn.port, 5433);
  assert.equal(conn.username, "app");
  assert.equal(conn.has_password, true);
  // 本体の DB から作った接続は、どのワークツリーのものでもない
  assert.equal(conn.worktree_path, null);
  assert.equal(((await target(s, compose, "db")).body as DockerDbTarget).connection_id, conn.id);

  // ポートを出していないサービスの案は作れない
  const hiddenKey = candidate.key.replace(/^docker:db:/, "docker:hidden:");
  assert.equal((await s.call("POST", `/api/projects/${s.project.id}/db-connections/import`, { items: [{ key: hiddenKey, name: "x", environment: "local" }] })).status, 400);
});

test("Docker の DB で開く: 同じ種類・この Mac の中のホスト・ポートの登録済みの接続があれば、それを指す", async () => {
  const s = setup();
  const compose = await withDbCompose(s);
  const res = await s.call("POST", `/api/projects/${s.project.id}/db-connections`, { name: "手で登録", engine: "postgres", environment: "local", host: "127.0.0.1", port: 5433, database: "other", username: "app", file_path: null, ssl: null, read_only: false, ai_access: "allow" });
  assert.equal(res.status, 201);
  assert.deepEqual((await target(s, compose, "db")).body, { connection_id: (res.body as DbConnection).id, candidate: null, blocked: null });
});

test("Docker の DB で開く: ワークツリーの DB から作った接続は、そのワークツリーを覚える（消すとき一緒に消せる）", async () => {
  const s = setup();
  gitRepo({ dir: s.project.repo_path, files: { "compose.yaml": "services: {}\n", ".gitignore": ".env\n" } });
  s.dockerFake.set([{ match: "config --format json", stdout: JSON.stringify({ name: "app", services: { db: pg } }) }]);
  const made = await s.call("POST", `/api/projects/${s.project.id}/git/worktrees`, { branch: "feat/x" });
  const wt = (made.body as { path: string; main: boolean }[]).find((w) => !w.main)!;
  const list = (await s.call("GET", `/api/projects/${s.project.id}/docker`)).body as DockerList;
  const compose = list.composes.find((c) => c.worktree_path === wt.path);
  assert.ok(compose);
  const { candidate } = (await target(s, compose.key, "db")).body as DockerDbTarget;
  assert.ok(candidate);
  const created = await s.call("POST", `/api/projects/${s.project.id}/db-connections/import`, { items: [{ key: candidate.key, name: candidate.name, environment: "local" }] });
  assert.equal((created.body as DbConnection[])[0].worktree_path, wt.path);
});
