import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { canOpenExternal, openExternal, openInDefaultBrowser } from "./native";

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

test("openInDefaultBrowser: Mac のアプリではメインの openWebUrl で開き、そうでなければ開き元を渡さない新しいタブ", () => {
  const opened: unknown[][] = [];
  vi.stubGlobal("window", { kickoff: { externalApps: { openWebUrl: async (url: string) => void opened.push(["ipc", url]) } }, open: (...args: unknown[]) => void opened.push(args) });
  openInDefaultBrowser("https://github.com/o/r/pull/1");
  vi.stubGlobal("window", { open: (...args: unknown[]) => void opened.push(args) });
  openInDefaultBrowser("https://github.com/o/r/pull/2");
  assert.deepEqual(opened, [
    ["ipc", "https://github.com/o/r/pull/1"],
    ["https://github.com/o/r/pull/2", "_blank", "noopener,noreferrer"],
  ]);
});
