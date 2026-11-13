// 本文の画像のうち、リポジトリの中のファイルを指すものの見分け
import assert from "node:assert/strict";
import { test } from "node:test";
import { isFileOfRepo, repoFileOfUrl } from "./repoImage";

test("repoFileOfUrl: raw・blob?raw=true・raw.githubusercontent.com を読む", () => {
  assert.deepEqual(repoFileOfUrl("https://github.com/o/r/raw/main/docs/a%20b.png", "github.com"), { owner: "o", name: "r", ref: "main", path: "docs/a b.png" });
  assert.deepEqual(repoFileOfUrl("https://github.com/o/r/blob/abc123/a.png?raw=true", "github.com"), { owner: "o", name: "r", ref: "abc123", path: "a.png" });
  assert.deepEqual(repoFileOfUrl("https://raw.githubusercontent.com/o/r/refs/heads/feat/x/img/a.png?token=T", "github.com"), {
    owner: "o",
    name: "r",
    ref: "refs/heads/feat",
    path: "x/img/a.png",
  });
});

test("repoFileOfUrl: リポジトリのファイルでないもの・壊れたものは null", () => {
  for (const url of [
    "https://github.com/o/r/blob/main/a.png",
    "https://private-user-images.githubusercontent.com/1/2-x.png?jwt=e",
    "https://github.com/user-attachments/assets/uuid",
    "http://github.com/o/r/raw/main/a.png",
    "https://github.com/o/r/raw/main",
    "https://github.com/o/r/raw/main/../a.png",
    "https://github.com/o/r/raw/main/a%2Fb.png",
    "https://example.com/o/r/raw/main/a.png",
    "nope",
  ])
    assert.equal(repoFileOfUrl(url, "github.com"), null, url);
  // raw.githubusercontent.com は github.com のときだけ
  assert.equal(repoFileOfUrl("https://raw.githubusercontent.com/o/r/main/a.png", "ghe.example.com"), null);
  assert.deepEqual(repoFileOfUrl("https://GHE.example.com/o/r/raw/main/a.png", "ghe.example.com")?.path, "a.png");
});

test("isFileOfRepo: 大文字・小文字は問わない", () => {
  const file = { owner: "O", name: "R", ref: "main", path: "a.png" };
  assert.equal(isFileOfRepo(file, "o/r"), true);
  assert.equal(isFileOfRepo(file, "o/other"), false);
});
