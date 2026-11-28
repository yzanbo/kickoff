import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "vitest";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { createPinstageBadgeFile } from "./pinstageBadgeFile";

test("作成済みのファイルを壊さずに置き換え、終了時は自分の JSON だけ消す", async () => {
  const appData = tempDir();
  const dir = path.join(appData, "Pinstage", "BadgeSources");
  const target = path.join(dir, "app.nexy.Kickoff.json");
  // 前の ID のファイルは、最初の書き出しで片付ける
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "app.kickoff.desktop.json"), "{}");
  const file = createPinstageBadgeFile(() => appData);
  await file.write('{"label":"作業中"}');
  await fs.writeFile(path.join(dir, "other.json"), "{}");
  const previous = await fs.open(target);
  try {
    await file.write('{"badges":[]}');
    // 置き換え前に開いた読み手には、古いファイル全体がそのまま見える。
    assert.equal(await previous.readFile("utf8"), '{"label":"作業中"}');
    assert.equal(await fs.readFile(target, "utf8"), '{"badges":[]}');
    if (process.platform !== "win32") assert.equal((await fs.stat(target)).mode & 0o777, 0o600);
  } finally {
    await previous.close();
  }
  assert.deepEqual((await fs.readdir(dir)).sort(), ["app.nexy.Kickoff.json", "other.json"]);
  await file.remove();
  await file.remove();
  assert.deepEqual(await fs.readdir(dir), ["other.json"]);
});
