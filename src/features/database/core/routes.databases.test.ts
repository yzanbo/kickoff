// API のテスト: DB クライアントの接続（登録・パスワードの扱い・写す・取り込む・手順ノート・AI 用のユーザー・SSH トンネル・試す・暗号化）
// DB ワーカーは同じプロセスで動かす（testing/testServer.ts の setup({ features: ["database"] })）。本物のプロセスでの起動は core/workerClient.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { type DbConnection, type DbImportCandidate } from "@shared/database/types";
import type { BusEvent } from "@shared/foundation/contract";
import { setup } from "@/app/core/testing/testServer";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { appDataDir } from "@/foundation/core/system/appEnv";
import { quietShell } from "@/foundation/core/testing/quietShell";
import { dbVaultOf, makeSqlite, sqliteBody } from "@/features/database/core/testing";

quietShell();

test("DB の接続: 作る・一覧・変える・並べ替える・消す。パスワードは保存したかだけ返し、消すと秘密の値も消える", async () => {
  const { call, project, store, bus } = setup({ features: ["database"] });
  const events: BusEvent[] = [];
  bus.subscribe((e) => events.push(e));
  makeSqlite(project.repo_path);

  const created = await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody());
  assert.equal(created.status, 201);
  assert.equal(created.body.has_password, false);
  const pg = (
    await call("POST", `/api/projects/${project.id}/db-connections`, {
      ...sqliteBody({ name: "本番", engine: "postgres", environment: "production", host: "db.example.com", port: 5432, database: "app", username: "u", file_path: null }),
      read_only: true,
      ai_access: "none",
      ssl: { mode: "require", ca_path: null },
      password: "s3cret",
    })
  ).body as DbConnection;
  assert.equal(pg.has_password, true);
  assert.deepEqual(pg.ssl, { mode: "require", ca_path: null });
  assert.ok(!JSON.stringify(pg).includes("s3cret"));
  assert.equal(store.dbConnections.storedSecret(pg.id, "password"), "s3cret");
  // 知らせには中身を載せない
  assert.ok(events.some((e) => e.type === "db_connections" && e.project_id === project.id));
  assert.ok(!JSON.stringify(events).includes("db.example.com"));

  const list = (await call("GET", `/api/projects/${project.id}/db-connections`)).body as DbConnection[];
  assert.deepEqual(
    list.map((c) => c.name),
    ["ローカルの DB", "本番"],
  );

  // パスワードは省けばそのまま、null で消す
  const renamed = (await call("PATCH", `/api/projects/${project.id}/db-connections/${pg.id}`, { name: "本番2" })).body as DbConnection;
  assert.equal(renamed.name, "本番2");
  assert.equal(renamed.has_password, true);
  assert.equal(((await call("PATCH", `/api/projects/${project.id}/db-connections/${pg.id}`, { password: null })).body as DbConnection).has_password, false);
  await call("PATCH", `/api/projects/${project.id}/db-connections/${pg.id}`, { password: "again" });

  assert.equal((await call("DELETE", `/api/projects/${project.id}/db-connections/${pg.id}`)).status, 204);
  assert.equal(store.dbConnections.storedSecret(pg.id, "password"), null);
  assert.equal((await call("DELETE", `/api/projects/${project.id}/db-connections/${pg.id}`)).status, 404);
});

test("DB の接続: 種類ごとに要る項目・Kickoff 自身のデータは断り、ほかのプロジェクトの接続は 404。プロジェクトを消すと秘密の値も消える", async () => {
  const { call, project, store, dbFake } = setup({ features: ["database"] });
  const base = `/api/projects/${project.id}/db-connections`;
  assert.equal((await call("POST", base, sqliteBody({ file_path: null }))).status, 400);
  assert.equal((await call("POST", base, sqliteBody({ engine: "mysql", file_path: null }))).status, 400);
  // Kickoff の保存先の中（リンクを解いた実体で比べる）
  fs.writeFileSync(path.join(dbFake.dataDir, "kickoff.db"), "");
  const kickoff = await call("POST", base, sqliteBody({ file_path: path.join(dbFake.dataDir, "kickoff.db") }));
  assert.equal(kickoff.status, 400);
  assert.match(kickoff.body.error, /Kickoff 自身のデータ/);
  const link = path.join(tempDir(), "link");
  fs.symlinkSync(dbFake.dataDir, link);
  assert.equal((await call("POST", base, sqliteBody({ file_path: path.join(link, "kickoff.db") }))).status, 400);
  // 動いているアプリのほか、製品版と開発版の両方の保存先も断る（開発版から製品版の DB を登録させない）
  for (const env of ["production", "development"] as const) {
    const res = await call("POST", base, sqliteBody({ file_path: path.join(appDataDir(dbFake.appDataRoot, env), "kickoff.db") }));
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Kickoff 自身のデータ/);
  }

  const other = store.projects.create({ name: "o", repo_path: tempDir(), provider: "claude" });
  const theirs = store.dbConnections.create(other.id, { ...sqliteBody(), password: "p" });
  assert.equal((await call("PATCH", `${base}/${theirs.id}`, { name: "x" })).status, 404);
  store.projects.delete(other.id);
  assert.equal(store.dbConnections.get(theirs.id), undefined);
  assert.equal(store.dbConnections.storedSecret(theirs.id, "password"), null);
});

test("DB の接続: 書き込む前の確かめ（省けば環境の既定・選んだ値・変える・写すときも同じ）", async () => {
  const { call, project, store } = setup({ features: ["database"] });
  makeSqlite(project.repo_path);
  const base = `/api/projects/${project.id}/db-connections`;
  const local = (await call("POST", base, sqliteBody())).body as DbConnection;
  assert.equal(local.write_check, "dangerous");
  const staging = (await call("POST", base, sqliteBody({ name: "ステージング", environment: "staging" }))).body as DbConnection;
  assert.equal(staging.write_check, "all");
  const chosen = (await call("POST", base, sqliteBody({ name: "選んだ", write_check: "env_name" }))).body as DbConnection;
  assert.equal(chosen.write_check, "env_name");
  const changed = (await call("PATCH", `${base}/${local.id}`, { write_check: "all" })).body as DbConnection;
  assert.equal(changed.write_check, "all");
  assert.equal((await call("PATCH", `${base}/${local.id}`, { write_check: "never" })).status, 400);
  const other = store.projects.create({ name: "o", repo_path: tempDir(), provider: "claude" });
  const copied = (await call("POST", `/api/projects/${other.id}/db-connections/copy`, { from_id: chosen.id, copy_password: false })).body as DbConnection;
  assert.equal(copied.write_check, "env_name");
});

test("DB の接続: ほかのプロジェクトから写す（パスワードは選んだときだけ）", async () => {
  const { call, project, store } = setup({ features: ["database"] });
  const other = store.projects.create({ name: "o", repo_path: tempDir(), provider: "claude" });
  const from = store.dbConnections.create(other.id, { ...sqliteBody({ engine: "postgres", host: "h", file_path: null }), password: "p" });
  const without = (await call("POST", `/api/projects/${project.id}/db-connections/copy`, { from_id: from.id, copy_password: false })).body as DbConnection;
  assert.equal(without.project_id, project.id);
  assert.equal(without.host, "h");
  assert.equal(without.has_password, false);
  const withPassword = (await call("POST", `/api/projects/${project.id}/db-connections/copy`, { from_id: from.id, copy_password: true })).body as DbConnection;
  assert.equal(store.dbConnections.storedSecret(withPassword.id, "password"), "p");
});

test("DB の接続: 同じプロジェクトの中で写すと、名前に「のコピー」を付けて手順ノートも同じものを指す", async () => {
  const { call, project } = setup({ features: ["database"] });
  const base = `/api/projects/${project.id}/db-connections`;
  const from = (await call("POST", base, sqliteBody({ name: "開発", note_path: "DB/開発.md" }))).body as DbConnection;
  const copied = (await call("POST", `${base}/copy`, { from_id: from.id, copy_password: false })).body as DbConnection;
  assert.equal(copied.name, "開発 のコピー");
  assert.equal(copied.note_path, "DB/開発.md");
  assert.equal(copied.file_path, from.file_path);
});

test("DB の接続: プロジェクトから取り込む（案にパスワードは出さず、取り込むときに読み直す。登録済みの印・環境の既定・ないものは 404）", async () => {
  const { call, project, store } = setup({ features: ["database"] });
  const base = `/api/projects/${project.id}/db-connections/import`;
  makeSqlite(project.repo_path);
  fs.writeFileSync(path.join(project.repo_path, ".env"), "DATABASE_URL=postgres://app:s3cret@db.example.com/shop\n");
  store.dbConnections.create(project.id, { ...sqliteBody(), password: null });

  const res = await call("GET", base);
  assert.equal(res.status, 200);
  assert.ok(!JSON.stringify(res.body).includes("s3cret"));
  const list = res.body as DbImportCandidate[];
  assert.deepEqual(
    list.map((c) => [c.key, c.engine, c.environment, c.has_password, c.existing_id !== null]),
    [
      ["env:.env:DATABASE_URL", "postgres", "production", true, false],
      ["file:app.db", "sqlite", "local", false, true],
    ],
  );

  const created = await call("POST", base, { items: [{ key: "env:.env:DATABASE_URL", name: "店の DB", environment: "staging" }] });
  assert.equal(created.status, 201);
  const [conn] = created.body as DbConnection[];
  assert.equal(conn.name, "店の DB");
  assert.equal(conn.host, "db.example.com");
  assert.equal(conn.environment, "staging");
  assert.equal(conn.ai_access, "ask");
  assert.equal(conn.read_only, false);
  assert.equal(conn.has_password, true);
  assert.ok(!JSON.stringify(created.body).includes("s3cret"));
  assert.equal(store.dbConnections.storedSecret(conn.id, "password"), "s3cret");
  assert.equal(((await call("GET", base)).body as DbImportCandidate[])[0].existing_id, conn.id);

  assert.equal((await call("POST", base, { items: [{ key: "env:.env:NOPE", name: "x", environment: "local" }] })).status, 404);
  assert.equal((await call("POST", base, { items: [] })).status, 400);
});

test("DB の接続: 手順ノート（ノートのフォルダからの相対パス。外を指すものは断り、ノートの名前の変更・フォルダの移動で付け替え、写すときは外す）", async () => {
  const { call, api, project, store } = setup({ features: ["database"] });
  const base = `/api/projects/${project.id}/db-connections`;
  makeSqlite(project.repo_path);
  assert.equal((await call("POST", base, { ...sqliteBody(), note_path: "../x.md" })).status, 400);
  assert.equal((await call("POST", base, { ...sqliteBody(), note_path: "/etc/x.md" })).status, 400);
  const a = (await call("POST", base, { ...sqliteBody(), note_path: "DB/ローカル.md" })).body as DbConnection;
  const b = (await call("POST", base, { ...sqliteBody({ name: "2 つ目" }), note_path: "DB/ローカル.md" })).body as DbConnection;
  const other = (await call("POST", base, { ...sqliteBody({ name: "別" }), note_path: "DB/ローカル.md.bak" })).body as DbConnection;
  assert.equal(a.note_path, "DB/ローカル.md");

  assert.equal((await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "DB/ローカル.md", content: "# x" } })).status, 201);
  assert.equal((await api("POST /api/projects/:projectId/notes/move", { params: { projectId: project.id }, body: { from: "DB/ローカル.md", to: "DB/Docker.md" } })).status, 200);
  assert.deepEqual([a, b, other].map((c) => store.dbConnections.get(c.id)!.note_path), ["DB/Docker.md", "DB/Docker.md", "DB/ローカル.md.bak"]);
  assert.equal((await api("POST /api/projects/:projectId/notes/move", { params: { projectId: project.id }, body: { from: "DB", to: "接続" } })).status, 200);
  assert.equal(store.dbConnections.get(a.id)!.note_path, "接続/Docker.md");

  const cleared = (await call("PATCH", `${base}/${a.id}`, { note_path: null })).body as DbConnection;
  assert.equal(cleared.note_path, null);
  const otherProject = store.projects.create({ name: "o", repo_path: tempDir(), provider: "claude" });
  const copied = (await call("POST", `/api/projects/${otherProject.id}/db-connections/copy`, { from_id: b.id, copy_password: false })).body as DbConnection;
  assert.equal(copied.note_path, null);
});

test("DB の接続: AI 用のユーザーとパスワード（パスワードは保存したかだけ返す・写すのは選んだときだけ・消すと秘密の値も消える）", async () => {
  const { call, project, store } = setup({ features: ["database"] });
  const base = `/api/projects/${project.id}/db-connections`;
  const body = { ...sqliteBody({ engine: "postgres", host: "h", file_path: null }), ai_username: "ai_reader", ai_password: "ai-s3cret" };
  const created = (await call("POST", base, body)).body as DbConnection;
  assert.equal(created.ai_username, "ai_reader");
  assert.equal(created.has_ai_password, true);
  assert.equal(created.has_password, false);
  assert.ok(!JSON.stringify(created).includes("ai-s3cret"));
  assert.equal(store.dbConnections.storedSecret(created.id, "ai_password"), "ai-s3cret");
  // 省けばそのまま、null で消す
  assert.equal(((await call("PATCH", `${base}/${created.id}`, { name: "x" })).body as DbConnection).has_ai_password, true);
  assert.equal(((await call("PATCH", `${base}/${created.id}`, { ai_password: null })).body as DbConnection).has_ai_password, false);
  await call("PATCH", `${base}/${created.id}`, { ai_password: "again" });
  // 空のユーザーは「ない」（null）
  assert.equal(((await call("POST", base, { ...body, name: "空", ai_username: " " })).body as DbConnection).ai_username, null);

  const other = (await call("POST", `${base}/copy`, { from_id: created.id, copy_password: false })).body as DbConnection;
  assert.equal(other.ai_username, "ai_reader");
  assert.equal(other.has_ai_password, false);
  const copied = (await call("POST", `${base}/copy`, { from_id: created.id, copy_password: true })).body as DbConnection;
  assert.equal(store.dbConnections.storedSecret(copied.id, "ai_password"), "again");

  await call("DELETE", `${base}/${created.id}`);
  assert.equal(store.dbConnections.storedSecret(created.id, "ai_password"), null);
});

test("DB の接続: SSH トンネル（パスワードは保存したかだけ返す・写すのは選んだときだけ・「-」で始まるホストは断る・~/.ssh/config の Host の一覧）", async () => {
  const { call, project, store } = setup({ features: ["database"] });
  const base = `/api/projects/${project.id}/db-connections`;
  const ssh = { host: "bastion", port: 2222, user: "ec2-user", identity_file: "~/.ssh/id_ed25519" };
  const body = { ...sqliteBody({ engine: "postgres", host: "db.internal", file_path: null }), ssh, ssh_password: "ssh-s3cret" };
  const created = (await call("POST", base, body)).body as DbConnection;
  assert.deepEqual(created.ssh, ssh);
  assert.equal(created.has_ssh_password, true);
  assert.equal(created.has_password, false);
  assert.ok(!JSON.stringify(created).includes("ssh-s3cret"));
  assert.equal(store.dbConnections.storedSecret(created.id, "ssh_password"), "ssh-s3cret");
  // 省けばそのまま、null で消す。ssh: null でトンネルをやめる
  assert.equal(((await call("PATCH", `${base}/${created.id}`, { name: "x" })).body as DbConnection).has_ssh_password, true);
  assert.equal(((await call("PATCH", `${base}/${created.id}`, { ssh_password: null })).body as DbConnection).has_ssh_password, false);
  await call("PATCH", `${base}/${created.id}`, { ssh_password: "again" });
  assert.equal(((await call("POST", base, { ...body, name: "なし", ssh: null })).body as DbConnection).ssh, null);

  const other = (await call("POST", `${base}/copy`, { from_id: created.id, copy_password: false })).body as DbConnection;
  assert.deepEqual(other.ssh, ssh);
  assert.equal(other.has_ssh_password, false);
  const copied = (await call("POST", `${base}/copy`, { from_id: created.id, copy_password: true })).body as DbConnection;
  assert.equal(store.dbConnections.storedSecret(copied.id, "ssh_password"), "again");

  // ssh のオプションと取り違えるホスト・ユーザー・空白入りは断る
  for (const bad of [{ host: "-oProxyCommand=touch /tmp/x" }, { host: "a b" }, { user: "-oX" }]) {
    assert.equal((await call("POST", base, { ...body, name: "悪い", ssh: { ...ssh, ...bad } })).status, 400);
    assert.equal((await call("POST", `${base}/ssh-host-key`, { ssh: { ...ssh, ...bad } })).status, 400);
  }
  assert.ok(Array.isArray((await call("GET", `${base}/ssh-hosts`)).body));

  await call("DELETE", `${base}/${created.id}`);
  assert.equal(store.dbConnections.storedSecret(created.id, "ssh_password"), null);
});

test("DB の接続: つながるか試す（保存しない）。ないファイルは失敗を返す", async () => {
  const { call, project } = setup({ features: ["database"] });
  makeSqlite(project.repo_path);
  const base = `/api/projects/${project.id}/db-connections`;
  const ok = (await call("POST", `${base}/test`, { ...sqliteBody(), name: undefined })).body;
  assert.equal(ok.ok, true);
  assert.match(ok.server_version, /^SQLite \d/);
  // つなぐのにかかった時間も返す（画面が結果に添える）
  assert.equal(typeof ok.duration_ms, "number");
  const missing = (await call("POST", `${base}/test`, sqliteBody({ file_path: "none.db" }))).body;
  assert.equal(missing.ok, false);
  assert.match(missing.error, /見つかりません/);
  // まだ対応していない種類も失敗の文で返す
  assert.equal((await call("POST", `${base}/test`, sqliteBody({ engine: "postgres", host: "127.0.0.1", file_path: null }))).body.ok, false);
  assert.equal(fs.existsSync(path.join(project.repo_path, "none.db")), false);
});

test("DB: 暗号化の口があれば、作る・取り込む・変えるパスワードを暗号化して置き、写すときは暗号化したまま。キーチェーンで拒否されたら 409", async () => {
  let deny = false;
  const secretCipher = {
    encrypt: async (plain: string) => Buffer.from(plain).toString("base64"),
    decrypt: async (sealed: string) => {
      if (deny) throw new Error("User denied");
      return Buffer.from(sealed, "base64").toString();
    },
  };
  const { call, store, project } = setup({ features: ["database"], secretCipher });
  const vault = dbVaultOf({ store }, secretCipher); // 同じ秘密の値を読む金庫（その場で入れた値の覚えは secrets.test.ts）
  const base = `/api/projects/${project.id}/db-connections`;
  const pgBody = { ...sqliteBody({ name: "本番", engine: "postgres", host: "127.0.0.1", port: 1, database: "app", username: "u", file_path: null }), password: "s3cret", ssh_password: null };
  const pg = (await call("POST", base, pgBody)).body as DbConnection;
  assert.equal(pg.has_password, true);
  const stored = store.dbConnections.storedSecret(pg.id, "password")!;
  assert.equal(stored, `safe:v1:${Buffer.from("s3cret").toString("base64")}`);
  assert.equal(await vault.read(pg, "password"), "s3cret");
  assert.equal((await call("GET", `${base}/${pg.id}/databases`)).status, 400); // つなぎに行くと開いて覚える（つなぎ先はない）

  const copied = (await call("POST", `${base}/copy`, { from_id: pg.id, copy_password: true })).body as DbConnection;
  assert.equal(store.dbConnections.storedSecret(copied.id, "password"), stored);

  await call("PATCH", `${base}/${pg.id}`, { password: "next" });
  assert.match(store.dbConnections.storedSecret(pg.id, "password")!, /^safe:v1:/);
  assert.equal(await vault.read(pg, "password"), "next");

  // 一度開いた値は起動している間覚えているので、拒否されても聞き直さない。まだ開いていない値は 409
  deny = true;
  assert.equal((await call("GET", `${base}/${copied.id}/databases`)).status, 400);
  const fresh = (await call("POST", base, { ...pgBody, name: "別", password: "other" })).body as DbConnection;
  const locked = await call("GET", `${base}/${fresh.id}/databases`);
  assert.equal(locked.status, 409, JSON.stringify(locked.body));
  assert.equal((locked.body as { code: string }).code, "db_password_locked");

  // その場で入れたパスワードで先へ進む（ここではつなぎ先がないので接続の失敗になる）。保存した値は変えない
  const storedFresh = store.dbConnections.storedSecret(fresh.id, "password");
  assert.equal((await call("POST", `${base}/${fresh.id}/entered-passwords`, { password: "typed" })).status, 204);
  assert.equal((await call("GET", `${base}/${fresh.id}/databases`)).status, 400); // 409 でない = 入れた値でつなぎに行った
  assert.equal(store.dbConnections.storedSecret(fresh.id, "password"), storedFresh);
  assert.equal((await call("POST", `${base}/${fresh.id}/entered-passwords`, { password: "" })).status, 400);
});
