import assert from "node:assert/strict";
import { test } from "vitest";
import { defaultGitHubFilter } from "@shared/github/searchQuery";
import { FILTER_CHIPS } from "./githubFilterChips";

const chips = (f: ReturnType<typeof defaultGitHubFilter>) => FILTER_CHIPS.map((c) => `${c.label(f)}${c.active(f) ? "*" : ""}`);

test("FILTER_CHIPS: 既定の札は色なし、変えた札は名前と色（複数選べるものは 1 つならその値・2 つ以上なら数）", () => {
  const base = defaultGitHubFilter("issue");
  assert.deepEqual(chips(base).slice(1, 5), ["自分", "ラベル", "担当", "マイルストーン"]);
  assert.deepEqual(chips({ ...base, labels: ["bug", "ui"], assignees: ["octo"], milestones: ["v1", "v2"] }).slice(2, 5), ["ラベル 2*", "担当: octo*", "マイルストーン 2*"]);
});
