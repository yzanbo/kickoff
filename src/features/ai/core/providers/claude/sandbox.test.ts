import assert from "node:assert/strict";
import { test } from "vitest";
import { claudeSandbox, claudeSandboxOption } from "./sandbox";

test("Claude Code の砂場: 書く場所だけを絞り、外で流し直す道は切る。この Mac の中の接続・ソケット・システムのサービスは通し、通信は Kickoff の中継へ", () => {
  const s = claudeSandbox({ writableDirs: ["/w"], readOnlyDirs: ["/r"], unsandboxedCommands: ["brew install:*"], proxyPort: 1234 });
  assert.equal(s.enabled, true);
  assert.equal(s.failIfUnavailable, true);
  assert.equal(s.allowUnsandboxedCommands, false);
  assert.deepEqual(s.excludedCommands, ["brew install:*"]);
  assert.deepEqual(s.filesystem, { allowWrite: ["/w"], denyWrite: ["/r"] });
  assert.deepEqual(s.network, { allowLocalBinding: true, allowAllUnixSockets: true, allowMachLookup: ["*"], httpProxyPort: 1234 });
  // 中継がなければ Claude Code の中継のまま（承認は canUseTool が聞かずに許す）
  assert.equal(claudeSandbox({ writableDirs: [], readOnlyDirs: [], unsandboxedCommands: [], proxyPort: null }).network?.httpProxyPort, undefined);
});

test("利用者が砂場オフを選んだら Claude Code の設定も無効にし、省略時は従来どおりにする", () => {
  const sandbox = { writableDirs: ["/w"], readOnlyDirs: [], unsandboxedCommands: [], proxyPort: null };
  assert.deepEqual(claudeSandboxOption(sandbox, true), { enabled: false });
  assert.equal(claudeSandboxOption(sandbox, false)?.enabled, true);
  assert.equal(claudeSandboxOption(null, undefined), undefined);
});
