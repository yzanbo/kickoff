import assert from "node:assert/strict";
import { test } from "node:test";
import { rewindFailure } from "./rewind.js";

test("ファイルを戻せなかったときの文: 控えがないときは、長いチャットの乗り換えより前の発言かもしれないことを添える", () => {
  assert.equal(rewindFailure(undefined), "ファイルを戻せませんでした");
  assert.equal(rewindFailure("busy"), "ファイルを戻せませんでした: busy");
  assert.match(rewindFailure("No file checkpoint found for this message."), /直近 3 区切り/);
});
