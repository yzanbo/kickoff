// AI の SQL の CSV の置き場所と片付け: 製品版と開発版で分ける・チャットごとのフォルダ・7 日を過ぎたもの・もうないチャットのものを消す
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { tempDir } from "../testing/tempDir.js";
import { AI_EXPORT_KEEP_MS, aiExportFile, aiExportRoot, cleanAiExports, removeChatExports } from "./aiExports.js";

test("aiExportRoot・aiExportFile: 保存先の名前ごとのフォルダ、チャットごとに日時と接続の名前のファイル", () => {
  assert.equal(aiExportRoot("/Users/a/Library/Application Support/Kickoff", "/tmp"), "/tmp/kickoff-db");
  assert.equal(aiExportRoot("/Users/a/Library/Application Support/Kickoff Dev", "/tmp"), "/tmp/kickoff-dev-db");
  const file = aiExportFile("/tmp/kickoff-db", 7, "本番 / main", new Date(2026, 10, 11, 9, 5, 3));
  assert.match(file, /^\/tmp\/kickoff-db\/7\/20261111-090503-本番_main-[0-9a-f]{6}\.csv$/);
});

test("cleanAiExports: 7 日を過ぎたファイル・もうないチャット・チャットでないものを消し、空のフォルダも消す", () => {
  const root = tempDir();
  const now = Date.now();
  const put = (rel: string, ageMs: number) => {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, "x");
    const t = (now - ageMs) / 1000;
    fs.utimesSync(full, t, t);
  };
  put("1/new.csv", 60_000);
  put("1/old.csv", AI_EXPORT_KEEP_MS + 60_000);
  put("2/old.csv", AI_EXPORT_KEEP_MS + 60_000);
  put("3/new.csv", 60_000);
  put("junk/a.csv", 0);
  cleanAiExports(root, (id) => id !== 3, now);
  assert.deepEqual(fs.readdirSync(root).sort(), ["1"]);
  assert.deepEqual(fs.readdirSync(path.join(root, "1")), ["new.csv"]);

  removeChatExports(root, 1);
  assert.deepEqual(fs.readdirSync(root), []);
  // フォルダがなくても失敗しない
  cleanAiExports(path.join(root, "none"), () => true, now);
  removeChatExports(path.join(root, "none"), 1);
});
