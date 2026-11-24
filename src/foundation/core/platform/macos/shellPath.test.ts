import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { settle } from "@shared/foundation/testing/async";
import { manualClock } from "@/foundation/core/testing/manualClock";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { until } from "@/foundation/core/testing/until";
import { cleanPath, SHELL_PATH_FILE, startShellPath } from "./shellPath";

/** 手で答える読み直し */
function deferred() {
  let resolve!: (v: string | null) => void;
  const promise = new Promise<string | null>((r) => (resolve = r));
  return { promise, resolve, read: () => promise };
}

test("PATH: 前回の値を先に入れ、読み直した値で入れ替えてファイルを書き直す（起動したときの PATH は後ろに残す）", async () => {
  const dataDir = tempDir();
  fs.writeFileSync(path.join(dataDir, SHELL_PATH_FILE), JSON.stringify({ path: "/Users/me/.nvm/bin:/opt/homebrew/bin", at: "2026-11-15T00:00:00.000Z" }));
  const env: NodeJS.ProcessEnv = { PATH: "/usr/bin:/bin" };
  const shell = deferred();
  const clock = manualClock(Date.parse("2026-11-16T00:00:00.000Z"));
  const { ready } = startShellPath({ dataDir, read: shell.read, env, clock });
  // 読み直しを待たずに、前回の値が入っている
  assert.equal(env.PATH, "/Users/me/.nvm/bin:/opt/homebrew/bin:/usr/bin:/bin");
  shell.resolve("/Users/me/.volta/bin:/opt/homebrew/bin:relative/dir:/usr/bin");
  await ready;
  assert.equal(env.PATH, "/Users/me/.volta/bin:/opt/homebrew/bin:/usr/bin:/bin");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, SHELL_PATH_FILE), "utf8")), { path: "/Users/me/.volta/bin:/opt/homebrew/bin:/usr/bin", at: "2026-11-16T00:00:00.000Z" });
  assert.equal(clock.pending, 0);
});

test("PATH: ファイルがない・壊れているときは探す場所の既定を先に入れ、読めなければそのまま", async () => {
  for (const content of [null, "{", JSON.stringify({ path: 3 }), JSON.stringify({ path: "relative:only" })]) {
    const dataDir = tempDir();
    if (content !== null) fs.writeFileSync(path.join(dataDir, SHELL_PATH_FILE), content);
    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin" };
    const { ready } = startShellPath({ dataDir, read: async () => null, env, clock: manualClock() });
    assert.match(env.PATH!, /^\/usr\/bin:\/opt\/homebrew\/bin:\/usr\/local\/bin:/);
    await ready;
    assert.match(env.PATH!, /^\/usr\/bin:\/opt\/homebrew\/bin/);
    assert.equal(fs.existsSync(path.join(dataDir, SHELL_PATH_FILE)), content !== null);
  }
});

test("PATH: 読み直しが終わらなくても、打ち切りの時間で ready が解ける（読めたらあとで入れ替える）", async () => {
  const dataDir = tempDir();
  const env: NodeJS.ProcessEnv = { PATH: "/usr/bin" };
  const shell = deferred();
  const clock = manualClock();
  const { ready } = startShellPath({ dataDir, read: shell.read, env, clock, timeoutMs: 5000 });
  let settled = false;
  void ready.then(() => (settled = true));
  // 打ち切りの時間の手前では解けない
  await clock.advance(4999);
  await settle();
  assert.equal(settled, false);
  await clock.advance(1);
  await ready;
  shell.resolve("/late/bin");
  await until(() => env.PATH === "/late/bin:/usr/bin");
});

test("cleanPath: : で区切った絶対パスだけを、重なりを除いて残す", () => {
  assert.deepEqual(cleanPath("/a::b:/a:~/x:/c"), ["/a", "/c"]);
});
