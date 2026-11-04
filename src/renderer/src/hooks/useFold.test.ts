import assert from "node:assert/strict";
import { test } from "node:test";
import { installMemoryStorage } from "@/lib/memoryStorage";
import { readSetting, writeSetting } from "@/lib/storage";
import { FOLDS } from "@/lib/storageKeys";
import { foldAll } from "./useFold";

const { local } = installMemoryStorage();

test("foldAll: その場所で覚えているまとまり（描いていないものも）だけをそろえ、ほかの場所は変えない。描いているまとまりには知らせる", () => {
  const events: unknown[] = [];
  const target = new EventTarget();
  target.addEventListener("kickoff:fold-all", (e) => events.push((e as CustomEvent).detail));
  Object.assign(globalThis, { window: target });

  writeSetting(FOLDS("sidebar:p1"), true);
  writeSetting(FOLDS("sidebar:p1/g2/status:read"), true);
  writeSetting(FOLDS("panel:p1/g2"), true);
  foldAll("sidebar", true);
  assert.equal(readSetting(FOLDS("sidebar:p1")), false);
  assert.equal(readSetting(FOLDS("sidebar:p1/g2/status:read")), false);
  assert.equal(readSetting(FOLDS("panel:p1/g2")), true);
  assert.deepEqual(events, [{ place: "sidebar", collapsed: true }]);

  // 開くときは "1" を覚える（初めは閉じているアーカイブ済みも開く）
  writeSetting(FOLDS("sidebar:p1/archived"), false);
  foldAll("sidebar", false);
  assert.equal(local.getItem("kickoff:fold:sidebar:p1"), "1");
  assert.equal(local.getItem("kickoff:fold:sidebar:p1/archived"), "1");
});
