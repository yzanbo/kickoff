import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { canOpenExternal, openExternal } from "./native";

test("openExternal: 行き先の種類ごとに外のアプリの口を呼ぶ。Mac のアプリでなければ開かずに false", async () => {
  const calls: unknown[][] = [];
  const record =
    (name: string) =>
    async (...args: unknown[]) => {
      calls.push([name, ...args]);
    };
  const externalApps = { openPath: record("openPath"), revealPath: record("revealPath"), openInVSCode: record("openInVSCode"), openTerminal: record("openTerminal"), openBrowser: record("openBrowser") };
  vi.stubGlobal("window", { kickoff: { externalApps } });
  assert.equal(canOpenExternal(), true);
  assert.equal(await openExternal({ kind: "path", path: "/a" }), true);
  await openExternal({ kind: "reveal", path: "/a/b" });
  await openExternal({ kind: "vscode", path: "/a/c.ts", line: 3 });
  await openExternal({ kind: "terminal", dir: "/a", app: "ghostty" });
  await openExternal({ kind: "browser", url: "https://example.com" });
  assert.deepEqual(calls, [
    ["openPath", "/a"],
    ["revealPath", "/a/b"],
    ["openInVSCode", "/a/c.ts", 3],
    ["openTerminal", "/a", "ghostty"],
    ["openBrowser", "https://example.com", undefined],
  ]);
  vi.stubGlobal("window", {});
  assert.equal(canOpenExternal(), false);
  assert.equal(await openExternal({ kind: "path", path: "/a" }), false);
});
