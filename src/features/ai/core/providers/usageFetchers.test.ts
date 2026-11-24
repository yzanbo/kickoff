import assert from "node:assert/strict";
import { test } from "vitest";
import { PlannedProvider } from "./planned";
import { realUsageFetchers } from "./usageFetchers";

test("Cursor と Gemini は枠を返さず、公式の確認先を案内する", async () => {
  const fetchers = realUsageFetchers({ codex: new PlannedProvider("codex", "Codex", "codex"), copilot: new PlannedProvider("copilot", "Copilot", "copilot") });
  for (const [id, guide] of [["cursor", "ダッシュボード"], ["gemini", "Google AI Studio"]] as const) {
    const usage = await fetchers[id]();
    assert.equal(usage.provider, id);
    assert.equal(usage.status, "unavailable");
    assert.deepEqual(usage.windows, []);
    assert.match(usage.message ?? "", new RegExp(guide));
  }
});
