// DB のパスワードの暗号化（偽の暗号化の口で）: 保存の形・復号の覚え・拒否されたとき・その場で入れた値・暗号化していない値の置き換え
import assert from "node:assert/strict";
import { test } from "node:test";
import type { NewDbConnectionBody } from "@shared/types";
import { DB_PASSWORD_LOCKED } from "@shared/types";
import { setup } from "../testing/testServer.js";
import { DbPasswordLocked, DbSecretVault, type SecretCipher } from "./secrets.js";

/** 偽の暗号化（元の値を逆にして base64）。拒否・数え・暗号化の途中の差し込みができる */
function fakeCipher() {
  const state = { deny: false, decrypts: 0, duringEncrypt: null as (() => void) | null };
  const cipher: SecretCipher = {
    async encrypt(plain) {
      state.duringEncrypt?.();
      return Buffer.from([...plain].reverse().join("")).toString("base64");
    },
    async decrypt(sealed) {
      state.decrypts++;
      await new Promise((r) => setTimeout(r, 5));
      if (state.deny) throw new Error("User denied");
      return [...Buffer.from(sealed, "base64").toString()].reverse().join("");
    },
  };
  return { cipher, state };
}

const body = (over: Partial<NewDbConnectionBody> = {}): NewDbConnectionBody => ({
  name: "本番",
  engine: "postgres",
  environment: "production",
  host: "db.example.com",
  port: 5432,
  database: "app",
  username: "app",
  file_path: null,
  ssl: null,
  read_only: true,
  ai_access: "none",
  ...over,
});

test("DB のパスワード: 暗号化して置き、復号は起動している間だけ覚える（同時に読んでもキーチェーンには 1 回）", async () => {
  const { store, project } = setup();
  const { cipher, state } = fakeCipher();
  const vault = new DbSecretVault(store, cipher);
  const c = store.dbConnections.create(project.id, await vault.seal({ ...body(), password: "s3cret", ai_password: null, ssh_password: "ssh-p" }));
  const stored = store.dbConnections.password(c.id)!;
  assert.match(stored, /^safe:v1:/);
  assert.ok(!stored.includes("s3cret"));
  assert.equal(store.dbConnections.aiPassword(c.id), null);
  assert.equal(c.has_password, true);

  const [a, b] = await Promise.all([vault.read(c, "password"), vault.read(c, "password")]);
  assert.equal(a, "s3cret");
  assert.equal(b, "s3cret");
  assert.equal(await vault.read(c, "ssh_password"), "ssh-p");
  assert.equal(await vault.read(c, "ai_password"), null);
  assert.equal(state.decrypts, 2);
  await vault.read(c, "password");
  assert.equal(state.decrypts, 2);
});

test("DB のパスワード: 暗号化の口がなければ暗号化せずに置く（単体のコア・テスト）", async () => {
  const { store, project } = setup();
  const vault = new DbSecretVault(store, null);
  const c = store.dbConnections.create(project.id, await vault.seal({ ...body(), password: "plain" }));
  assert.equal(store.dbConnections.password(c.id), "plain");
  assert.equal(await vault.read(c, "password"), "plain");
  assert.equal(await vault.migrate(), 0);
});

test("DB のパスワード: キーチェーンで拒否されたら 409（db_password_locked）。その場で入れた値を使い、保存した値は消さない", async () => {
  const { store, project } = setup();
  const { cipher, state } = fakeCipher();
  const vault = new DbSecretVault(store, cipher);
  const c = store.dbConnections.create(project.id, await vault.seal({ ...body(), password: "s3cret", ssh_password: "ssh-p" }));
  state.deny = true;
  const locked = await vault.read(c, "password").catch((e) => e);
  assert.ok(locked instanceof DbPasswordLocked);
  assert.equal(locked.status, 409);
  assert.equal(locked.code, DB_PASSWORD_LOCKED);
  assert.match(locked.message, /「本番」の保存したパスワードを読めませんでした/);

  // 入れた値はその接続のその種類だけに効く（入れていない種類は、またキーチェーンに聞く）
  vault.enter(c.id, { password: "typed" });
  assert.equal(await vault.read(c, "password"), "typed");
  await assert.rejects(vault.read(c, "ssh_password"), DbPasswordLocked);
  assert.match(store.dbConnections.password(c.id)!, /^safe:v1:/);

  // 開けなかったものは覚えないので、許可されれば次の頼みで開ける。忘れたら保存した値に戻る
  state.deny = false;
  vault.forget(c.id);
  assert.equal(await vault.read(c, "password"), "s3cret");
});

test("DB のパスワード: 暗号化せずに置いていた値を一度だけ置き換える（ほかの秘密の値・途中で変わった値は変えない）", async () => {
  const { store, project } = setup();
  const plainVault = new DbSecretVault(store, null);
  const a = store.dbConnections.create(project.id, await plainVault.seal({ ...body({ name: "a" }), password: "pa", ai_password: "ai-a", ssh_password: "ssh-a" }));
  const b = store.dbConnections.create(project.id, await plainVault.seal({ ...body({ name: "b" }), password: "pb" }));
  store.secrets.set("openai_transcribe_key", "sk-xxx");

  const { cipher, state } = fakeCipher();
  const vault = new DbSecretVault(store, cipher);
  // 暗号化している間に b のパスワードが変わった（利用者が保存し直した）
  state.duringEncrypt = () => {
    state.duringEncrypt = null;
    store.dbConnections.update(b.id, { password: "changed" });
  };
  assert.equal(await vault.migrate(), 3);
  for (const stored of [store.dbConnections.password(a.id), store.dbConnections.aiPassword(a.id), store.dbConnections.sshPassword(a.id)]) assert.match(stored!, /^safe:v1:/);
  assert.equal(store.dbConnections.password(b.id), "changed");
  assert.equal(store.secrets.get("openai_transcribe_key"), "sk-xxx");
  assert.equal(await vault.read(a, "password"), "pa");
  assert.equal(await vault.read(a, "ai_password"), "ai-a");
  assert.equal(await vault.read(b, "password"), "changed");

  // 次の起動では b だけ（変わったので暗号化していない）を置き換える
  assert.equal(await vault.migrate(), 1);
  assert.equal(await vault.migrate(), 0);
  assert.equal(await vault.read(b, "password"), "changed");
});
