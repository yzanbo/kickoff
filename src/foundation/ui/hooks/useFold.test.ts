import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { installMemoryStorage } from "@/foundation/ui/testing/memoryStorage";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { storage as uiStorage } from "./storage";
import { foldAll } from "./useFold";

const { local } = installMemoryStorage();

test("foldAll: その場所で覚えているまとまり（描いていないものも）だけをそろえ、ほかの場所は変えない。描いているまとまりには知らせる", () => {
  const events: unknown[] = [];
  const target = new EventTarget();
  target.addEventListener("kickoff:fold-all", (e) => events.push((e as CustomEvent).detail));
  vi.stubGlobal("window", target);

  writeSetting(uiStorage.settings.fold("sidebar:p1"), true);
  writeSetting(uiStorage.settings.fold("sidebar:p1/g2/status:read"), true);
  writeSetting(uiStorage.settings.fold("panel:p1/g2"), true);
  foldAll("sidebar", true);
  assert.equal(readSetting(uiStorage.settings.fold("sidebar:p1")), false);
  assert.equal(readSetting(uiStorage.settings.fold("sidebar:p1/g2/status:read")), false);
  assert.equal(readSetting(uiStorage.settings.fold("panel:p1/g2")), true);
  assert.deepEqual(events, [{ place: "sidebar", collapsed: true }]);

  // 開くときは "1" を覚える（初めは閉じているアーカイブ済みも開く）
  writeSetting(uiStorage.settings.fold("sidebar:p1/archived"), false);
  foldAll("sidebar", false);
  assert.equal(local.getItem(uiStorage.settings.fold("sidebar:p1").key), "1");
  assert.equal(local.getItem(uiStorage.settings.fold("sidebar:p1/archived").key), "1");
});
