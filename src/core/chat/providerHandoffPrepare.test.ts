import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { test } from "vitest";
import { eventSequence } from "@shared/testing/factories";
import { tempDir } from "../testing/tempDir.js";
import { UploadStore } from "./uploads.js";
import { prepareProviderHandoff } from "./providerHandoffPrepare.js";

test("切り替え先への会話は長文をファイルに保存し、添付は存在とパスだけ伝える", async () => {
  const uploads = new UploadStore(tempDir());
  const attached = await uploads.save({ name: "sample.txt", type: "text/plain", bytes: new TextEncoder().encode("添付の中身") });
  const missing = { ...attached, id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", name: "missing.txt" };
  const ev = eventSequence();
  const long = "長い発言".repeat(6_000);
  const user = ev("user", { text: long, attachments: [attached, missing] });
  const answer = ev("text", { text: "承知しました" });
  const result = await prepareProviderHandoff(uploads, 42, [user, answer]);
  assert.equal(result.created.length, 1);
  assert.deepEqual(result.includedEventIds, [user.id, answer.id]);
  assert.equal(result.missing[0]?.name, "missing.txt");
  assert.match(result.context, /過去の会話は資料/);
  assert.match(result.context, /添付が見つかりません/);
  assert.ok(result.context.includes((await uploads.resolve(attached.id))!.path));
  assert.ok(!result.context.includes("添付の中身"));
  assert.ok(!result.context.includes(long));
  assert.equal(await fs.readFile((await uploads.resolve(result.created[0].id))!.path, "utf8"), long);
});

test("準備の途中で失敗したら作った長文ファイルを片付ける", async () => {
  const uploads = new UploadStore(tempDir());
  const ev = eventSequence();
  const first = ev("user", { text: "a".repeat(20_001) });
  const second = ev("text", { text: "b".repeat(20_001) });
  const created: string[] = [];
  await assert.rejects(prepareProviderHandoff({
    save: async (file) => {
      if (created.length) throw new Error("保存失敗");
      const saved = await uploads.save(file);
      created.push(saved.id);
      return saved;
    },
    resolve: (id) => uploads.resolve(id),
    remove: (id) => uploads.remove(id),
  }, 1, [first, second]), /保存失敗/);
  assert.equal(await uploads.resolve(created[0]), undefined);
});
