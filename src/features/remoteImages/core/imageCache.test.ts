import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "vitest";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { ScopedImageCache, type CacheRows } from "./imageCache";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

test("ScopedImageCache: 覚え書きを書けなかった（取っている間に範囲が消えた）ときも画像は返し、書いたファイルは残さない", async () => {
  const dir = tempDir();
  const rows: CacheRows = {
    cached: () => undefined,
    remember: () => {
      throw new Error("FOREIGN KEY constraint failed");
    },
    forget: () => {},
    totalSize: () => 0,
    oldest: () => [],
  };
  const cache = new ScopedImageCache({ dir, rows, fetcher: async () => ({ contentType: "image/png", body: PNG }), maxBytes: 1024 });
  const image = await cache.get(7, { host: "images.example.com", url: "https://images.example.com/a.png" });
  assert.deepEqual(image.body, PNG);
  assert.deepEqual(fs.readdirSync(cache.dirOf(7)), []);
});
