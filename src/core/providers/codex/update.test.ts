import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { tempDir } from "../../testing/tempDir.js";
import { CodexUpdateCheck } from "./update.js";

/** Homebrew の cask に入れた形の codex（PATH の場所はリンクで、実体は Caskroom の中） */
function caskCodex(): string {
  const root = tempDir();
  const real = path.join(root, "Caskroom", "codex", "0.169.0", "bin", "codex");
  fs.mkdirSync(path.dirname(real), { recursive: true });
  fs.writeFileSync(real, "");
  const link = path.join(root, "bin", "codex");
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(real, link);
  return link;
}

test("新しい版: 入れ方（リンクを解いた実体）で聞く先とコマンドを決め、新しければ版と上げ方を返す", async () => {
  const asked: string[] = [];
  const check = new CodexUpdateCheck(async (url) => {
    asked.push(url);
    return { version: "0.170.0" };
  });
  const codex = caskCodex();
  assert.deepEqual(await check.of(codex, "0.169.0"), { latest: "0.170.0", command: "brew upgrade --cask codex", source: "Homebrew の cask" });
  assert.deepEqual(asked, ["https://formulae.brew.sh/api/cask/codex.json"]);
  // 同じ版・新しい版を入れたあと・版が分からない・入れ方が分からないなら知らせない
  assert.equal(await check.of(codex, "0.170.0"), null);
  assert.equal(await check.of(codex, null), null);
  const unknown = path.join(tempDir(), "codex");
  fs.writeFileSync(unknown, "");
  assert.equal(await check.of(unknown, "0.1.0"), null);
});

test("新しい版: 聞くのは 1 日 1 回まで。聞けなければ知らせず、1 時間あけて聞き直す（前に読めた版は残す）", async () => {
  let now = 0;
  let answer: () => Promise<unknown> = async () => ({ version: "0.170.0" });
  let count = 0;
  const check = new CodexUpdateCheck(async () => {
    count++;
    return answer();
  }, () => now);
  const codex = caskCodex();
  assert.equal((await check.of(codex, "0.169.0"))?.latest, "0.170.0");
  now += 23 * 60 * 60 * 1000;
  await check.of(codex, "0.169.0");
  assert.equal(count, 1);
  // 24 時間たったら聞き直す。聞けなくても前に読めた版で知らせる
  now += 60 * 60 * 1000;
  answer = async () => Promise.reject(new Error("offline"));
  assert.equal((await check.of(codex, "0.169.0"))?.latest, "0.170.0");
  assert.equal(count, 2);
  now += 30 * 60 * 1000;
  await check.of(codex, "0.169.0");
  assert.equal(count, 2);
  now += 31 * 60 * 1000;
  answer = async () => ({ version: "0.171.0" });
  assert.equal((await check.of(codex, "0.169.0"))?.latest, "0.171.0");
  assert.equal(count, 3);
});

test("新しい版: 一度も聞けなければ知らせない。同時に頼まれても 1 回だけ聞く", async () => {
  let count = 0;
  const failing = new CodexUpdateCheck(async () => {
    count++;
    throw new Error("offline");
  });
  const codex = caskCodex();
  assert.deepEqual(await Promise.all([failing.of(codex, "0.169.0"), failing.of(codex, "0.169.0")]), [null, null]);
  assert.equal(count, 1);
});
