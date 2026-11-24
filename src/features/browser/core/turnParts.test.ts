import assert from "node:assert/strict";
import { test } from "vitest";
import type { LinkOpenTarget } from "@shared/settings/types";
import { browserSection, browserTurnParts } from "./turnParts";

test("ブラウザ: 開き先が Kickoff なら内蔵ツールを優先し、OS の既定なら外部で開くよう伝える", () => {
  const kickoff = browserSection("kickoff").lines.join("\n");
  assert.match(kickoff, /既定の開き先は「Kickoff のブラウザ」/);
  assert.match(kickoff, /kickoff_browser の browser_tabs・browser_open などを優先/);
  assert.match(kickoff, /利用者が別のブラウザや自動テストを指定した場合を除き/);
  const external = browserSection("browser").lines.join("\n");
  assert.match(external, /既定の開き先は「既定のブラウザ」（OS の既定のブラウザ）/);
  assert.doesNotMatch(external, /browser_open などを優先/);
  assert.deepEqual([browserSection("kickoff").order, browserSection("kickoff").heading], [300, "## ブラウザ"]);
});

test("ブラウザの contributor: 実行ごとに開き先を読み直す", async () => {
  let target: LinkOpenTarget = "kickoff";
  const c = browserTurnParts(() => target);
  const sectionOf = async () => (await c.contribute({} as never))?.promptSections?.[0]?.lines.join("\n") ?? "";
  assert.match(await sectionOf(), /「Kickoff のブラウザ」/);
  target = "browser";
  assert.match(await sectionOf(), /「既定のブラウザ」/);
});
