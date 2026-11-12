import assert from "node:assert/strict";
import { test } from "node:test";
import type { DbConnection } from "@shared/types";
import { DOCKER_DB_NO_PORT, dockerDbCandidate, dockerDbKey, parseDockerDbKey, sameServerConnection } from "./dbTarget.js";

const doc = (db: Record<string, unknown>) => ({ name: "app", services: { db, redis: { image: "redis:7" } } });
const pg = { image: "postgres:16", environment: { POSTGRES_USER: "app", POSTGRES_PASSWORD: "secret", POSTGRES_DB: "app_dev" }, ports: [{ target: 5432, published: "5433" }] };
const main = { key: "/repo|app|compose.yaml", file: "compose.yaml", worktree_path: null, branch: null };
const wt = { key: "/wt/feat-x|app-feat-x|compose.yaml", file: "compose.yaml", worktree_path: "/wt/feat-x", branch: "feat-x" };

test("dockerDbCandidate: compose の設定から localhost と Mac に出したポートの案を作る（パスワードも読む）", () => {
  const r = dockerDbCandidate({ compose: main, service: "db", doc: doc(pg), mainPort: null });
  assert.ok(r && "found" in r);
  assert.equal(r.found.key, dockerDbKey(main.key, "db"));
  assert.equal(r.found.engine, "postgres");
  assert.equal(r.found.host, "localhost");
  assert.equal(r.found.port, 5433);
  assert.equal(r.found.database, "app_dev");
  assert.equal(r.found.username, "app");
  assert.equal(r.found.password, "secret");
  assert.equal(r.found.name, "app_dev（compose）");
  assert.match(r.found.origin, /Docker タブ/);
});

test("dockerDbCandidate: ports がなければ押せない理由・DB のイメージでなければ null", () => {
  const { ports: _p, ...noPort } = pg;
  assert.deepEqual(dockerDbCandidate({ compose: main, service: "db", doc: doc(noPort), mainPort: null }), { blocked: DOCKER_DB_NO_PORT });
  assert.equal(dockerDbCandidate({ compose: main, service: "redis", doc: doc(pg), mainPort: null }), null);
  assert.equal(dockerDbCandidate({ compose: main, service: "nothing", doc: doc(pg), mainPort: null }), null);
});

test("dockerDbCandidate: ワークツリーの db は本体と別のポートならブランチを名前に添え、同じポートなら本体と同じ名前", () => {
  const separate = dockerDbCandidate({ compose: wt, service: "db", doc: doc(pg), mainPort: 5432 });
  assert.ok(separate && "found" in separate);
  assert.equal(separate.found.name, "app_dev（feat-x）");
  assert.match(separate.found.origin, /WT \| feat-x/);
  const same = dockerDbCandidate({ compose: wt, service: "db", doc: doc(pg), mainPort: 5433 });
  assert.ok(same && "found" in same);
  assert.equal(same.found.name, "app_dev（compose）");
  // ブランチが分からなければフォルダの名前
  const detached = dockerDbCandidate({ compose: { ...wt, branch: null }, service: "db", doc: doc(pg), mainPort: null });
  assert.ok(detached && "found" in detached);
  assert.equal(detached.found.name, "app_dev（feat-x）");
});

test("parseDockerDbKey: 印からサービスと compose の key を取り出す（compose の key に「:」があってもよい）", () => {
  assert.deepEqual(parseDockerDbKey(dockerDbKey("/a:b|p|compose.yaml", "db")), { service: "db", composeKey: "/a:b|p|compose.yaml" });
  assert.equal(parseDockerDbKey("compose:compose.yaml:db"), null);
  assert.equal(parseDockerDbKey("docker::x"), null);
  assert.equal(parseDockerDbKey("docker:db:"), null);
});

const conn = (id: number, patch: Partial<DbConnection>): DbConnection =>
  ({ id, engine: "postgres", host: "localhost", port: 5432, database: "app", ...patch }) as DbConnection;

test("sameServerConnection: 種類・この Mac の中のホスト・ポートが同じ接続（DB の名前まで同じものを先に）", () => {
  const list = [conn(1, { database: "other" }), conn(2, { host: "127.0.0.1" }), conn(3, { host: "db.example.com" }), conn(4, { engine: "mysql", port: 3306 })];
  assert.equal(sameServerConnection(list, { engine: "postgres", port: 5432, database: "app" })?.id, 2);
  assert.equal(sameServerConnection(list, { engine: "postgres", port: 5432, database: "zzz" })?.id, 1);
  assert.equal(sameServerConnection(list, { engine: "postgres", port: 5433, database: "app" }), undefined);
  // ポートを書いていなければ既定のポート
  assert.equal(sameServerConnection([conn(5, { engine: "mysql", port: null })], { engine: "mysql", port: 3306, database: "app" })?.id, 5);
});
