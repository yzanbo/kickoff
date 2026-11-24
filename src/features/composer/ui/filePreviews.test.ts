import assert from "node:assert/strict";
import { test } from "vitest";
import { createFilePreviews } from "./filePreviews";

/** 作った URL と解放した URL を数える偽物 */
function fakeUrls() {
  let n = 0;
  const live = new Set<string>();
  return {
    live,
    urls: {
      create: () => {
        const url = `blob:${++n}`;
        live.add(url);
        return url;
      },
      revoke: (url: string) => {
        assert.ok(live.delete(url), `${url} を 2 回解放した`);
      },
    },
  };
}

const image = new File(["x"], "a.png", { type: "image/png" });

test("プレビュー: 同じファイルには同じ URL を返し、外したものだけを解放する", () => {
  const { live, urls } = fakeUrls();
  const previews = createFilePreviews(urls);
  const a = previews.of("a", image);
  assert.equal(previews.of("a", image), a);
  previews.of("b", image);
  previews.drop("a");
  previews.drop("a");
  assert.deepEqual([...live], ["blob:2"]);
});

test("プレビュー: 隠れた（外れた）ら全部を解放し、表に戻ったら作り直す（作りっぱなしにしない・戻っても消えない）", () => {
  const { live, urls } = fakeUrls();
  const previews = createFilePreviews(urls);
  const before = previews.of("a", image);
  assert.equal(previews.releaseAll(), 1);
  assert.equal(live.size, 0);
  const after = previews.of("a", image);
  assert.notEqual(after, before);
  assert.deepEqual([...live], [after]);
  assert.equal(previews.releaseAll(), 1);
  assert.equal(previews.releaseAll(), 0);
  assert.equal(live.size, 0);
});
