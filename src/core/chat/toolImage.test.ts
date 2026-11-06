import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { tempDir } from "../testing/tempDir.js";
import { readToolImage } from "./toolImage.js";

test("readToolImage: 決めたフォルダの中の画像だけを返し、外・画像でない・ないものは断る", async () => {
  const root = tempDir({ real: true });
  const outside = tempDir({ real: true });
  fs.writeFileSync(path.join(root, "画面.png"), new Uint8Array([1, 2, 3]));
  fs.writeFileSync(path.join(root, "a.txt"), "x");
  fs.writeFileSync(path.join(outside, "秘密.png"), new Uint8Array([9]));
  // 中から外を指すリンクも外とみなす
  fs.symlinkSync(path.join(outside, "秘密.png"), path.join(root, "link.png"));

  const image = await readToolImage(path.join(root, "画面.png"), [root]);
  assert.deepEqual([...image.data], [1, 2, 3]);
  assert.equal(image.type, "image/png");
  assert.ok(image.mtimeMs > 0);

  await assert.rejects(readToolImage(path.join(outside, "秘密.png"), [root]), /外のファイル/);
  await assert.rejects(readToolImage(path.join(root, "link.png"), [root]), /外のファイル/);
  await assert.rejects(readToolImage(path.join(root, "..", path.basename(outside), "秘密.png"), [root]), /外のファイル/);
  await assert.rejects(readToolImage(path.join(root, "a.txt"), [root]), /画像のファイルではありません/);
  await assert.rejects(readToolImage("画面.png", [root]), /絶対パス/);
  await assert.rejects(readToolImage(path.join(root, "ない.png"), [root]), /ファイルがありません/);
});
