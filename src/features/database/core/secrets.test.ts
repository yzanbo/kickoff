// DB のパスワードの暗号化（偽の暗号化の口で）: 保存の形・復号の覚え・拒否されたとき・その場で入れた値
import assert from "node:assert/strict";
import { test } from "vitest";
import type { NewDbConnectionBody } from "@shared/database/api";
import { DB_PASSWORD_LOCKED } from "@shared/database/types";
import { setup } from "@/app/core/testing/testServer";
import { DbPasswordLocked, DbSecretVault, type SecretCipher } from "./secrets";

/** 偽の暗号化（元の値を逆にして base64）。拒否と数えができる */
function fakeCipher() {
  const state = { deny: false, decrypts: 0 };
  const cipher: SecretCipher = {
    async encrypt(plain) {
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
  const stored = store.dbConnections.storedSecret(c.id, "password")!;
  assert.match(stored, /^safe:v1:/);
  assert.ok(!stored.includes("s3cret"));
  assert.equal(store.dbConnections.storedSecret(c.id, "ai_password"), null);
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
  assert.equal(store.dbConnections.storedSecret(c.id, "password"), "plain");
  assert.equal(await vault.read(c, "password"), "plain");
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
  assert.match(store.dbConnections.storedSecret(c.id, "password")!, /^safe:v1:/);

  // 開けなかったものは覚えないので、許可されれば次の頼みで開ける。忘れたら保存した値に戻る
  state.deny = false;
  vault.forget(c.id);
  assert.equal(await vault.read(c, "password"), "s3cret");
});
