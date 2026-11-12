import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { MAX_UPLOAD_BYTES, UploadStore, safeFileName, withAttachmentNote } from "./uploads.js";
import { tempDir } from "../testing/tempDir.js";

const dir = () => tempDir();

test("添付ファイルを保存して ID から取り出せる", async () => {
  const store = new UploadStore(dir());
  const saved = await store.save({ name: "画面案.png", type: "image/png", bytes: new Uint8Array([1, 2, 3]) });
  assert.equal(saved.name, "画面案.png");
  assert.equal(saved.size, 3);
  const resolved = await store.resolve(saved.id);
  assert.ok(resolved);
  assert.deepEqual([...fs.readFileSync(resolved.path)], [1, 2, 3]);
  assert.equal(await store.resolve("../../etc/passwd"), undefined);
});

test("ファイル名からパス区切りを取り除き、大きすぎるファイルは拒否する", async () => {
  assert.equal(safeFileName("../../evil.sh"), "evil.sh");
  assert.equal(safeFileName("a:b.txt"), "a_b.txt");
  assert.equal(safeFileName(".."), "file");
  const store = new UploadStore(dir());
  await assert.rejects(store.save({ name: "big.bin", type: "", bytes: new Uint8Array(MAX_UPLOAD_BYTES + 1) }), /大きすぎ/);
});

test("エージェントへのメッセージに添付のパスを書き添える", () => {
  const files = [{ path: "/data/uploads/x/a.pdf", attachment: { kind: "file" as const, id: "x", name: "a.pdf", mime: "application/pdf", size: 2048 } }];
  assert.match(withAttachmentNote("これを読んで", files), /これを読んで\n\n添付ファイル（Read ツールで読めます）:\n- \/data\/uploads\/x\/a.pdf（application\/pdf, 2.0 KB）/);
  // 本文がなくても添付だけで送れる
  assert.match(withAttachmentNote("", files), /^添付ファイル/);
  assert.equal(withAttachmentNote("本文のみ", []), "本文のみ");
});
