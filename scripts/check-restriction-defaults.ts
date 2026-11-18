// macOS のターミナルで `npx tsx scripts/check-restriction-defaults.ts claude|codex` を実行する実機確認。
// 既存の Kickoff のデータは使わない。選んだ AI に 2 回送信し、サブスクの使用枠を使う（CLI の会話履歴に残る）。
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { Bus } from "../src/core/bus.js";
import { ApprovalCenter } from "../src/core/chat/approvals.js";
import { Runner } from "../src/core/chat/runner.js";
import { Store } from "../src/core/db/store.js";
import { macosAgentSandbox } from "../src/core/platform/macos/sandbox.js";
import { createProviders } from "../src/core/providers/index.js";
import { providerModels } from "../src/core/providers/modelCatalog.js";
import { ScriptedProvider } from "../src/core/testing/fakeProvider.js";
import type { UsageMonitor } from "../src/core/usage/planUsage.js";

const arg = process.argv[2];
if (process.platform !== "darwin" || (arg !== "claude" && arg !== "codex")) {
  throw new Error("macOS のリポジトリルートで実行し、引数に claude または codex を指定してください。");
}
const provider: "claude" | "codex" = arg;
const selfTest = process.argv.includes("--self-test");
const providers = createProviders();
const providerLabel = providers[provider].label;
let model: string | null = null;
if (!selfTest) {
  const status = await providers[provider].status();
  if (!status.logged_in) throw new Error(`${providerLabel} の接続状態を確認してください: ${status.detail}`);
} else {
  console.log("検証スクリプトの自己テスト（実際の AI・OS の砂場は使いません）。");
}
if (provider === "codex") {
  // CLI の設定に残ったモデルではなく、このアカウントで取得した一覧から選ぶ。
  const models = selfTest
    ? [{ value: "self-test-other", is_default: false }, { value: "self-test-codex", is_default: true }]
    : await providerModels(providers.codex);
  model = (models.find((option) => option.is_default) ?? models[0])?.value ?? null;
  if (!model) throw new Error("Codex のモデル一覧が空だったため、検証メッセージは送信しません。");
}
// どちらもこの実行専用。作業フォルダの外側は、一時フォルダの許可に入らないリポジトリルートに置く。
const workdir = mkdtempSync(path.join(realpathSync(tmpdir()), "kickoff-restrictions-"));
const outside = mkdtempSync(path.join(realpathSync(fileURLToPath(new URL("..", import.meta.url))), ".kickoff-restrictions-"));
const bus = new Bus();
const store = new Store(":memory:", (event) => bus.publish(event));
const approvals = new ApprovalCenter(bus);
const usage = { get: async () => ({ available: false }), refresh: async () => ({ available: false }) } as unknown as UsageMonitor;
const runner = new Runner({
  store, approvals, providers, usage, bus,
  bashSandbox: { rules: macosAgentSandbox(), proxyPort: null, trashDir: null },
});
const project = store.projects.create({ name: "新規チャットの制限の検証", repo_path: workdir, provider });
const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;

async function verify(sandboxEnabled: boolean) {
  const label = sandboxEnabled ? "サンドボックス オン" : "サンドボックス オフ";
  store.settings.update({ sandbox_enabled_by_default: sandboxEnabled });
  const chat = store.chats.create({ project_id: project.id, provider, title: label, status: "completed", permission_mode: "default", model });
  assert.equal(chat.sandbox_enabled, sandboxEnabled);
  assert.equal(chat.edit_scope_enabled, true);
  const token = randomUUID();
  const insideFile = path.join(workdir, `${token}.txt`);
  const outsideFile = path.join(outside, `${token}.txt`);
  const errorFile = path.join(workdir, `${token}.stderr`);
  // Codex のコードモードでは Bash の結果イベントが届かない場合がある。外側での書き込みの標準エラーを内側に取り、実ファイルと照合する。
  const command = `printf %s ${quote(token)} > ${quote(insideFile)} && { printf %s ${quote(token)} > ${quote(outsideFile)}; } 2> ${quote(errorFile)}`;
  if (selfTest) {
    providers[provider] = new ScriptedProvider(async (params, callbacks, signal) => {
      assert.equal(params.model, provider === "codex" ? "self-test-codex" : null);
      assert.equal(params.disableSandbox, !sandboxEnabled);
      assert.equal(Boolean(params.bashSandbox), sandboxEnabled);
      assert.ok(params.writeScope);
      const input = { command };
      const decision = await callbacks.requestApproval({ kind: "permission", toolName: "Bash", input, canRemember: false }, signal);
      assert.equal(decision.action, "allow");
      writeFileSync(insideFile, token);
      if (!sandboxEnabled) writeFileSync(outsideFile, token);
      writeFileSync(errorFile, sandboxEnabled ? `${outsideFile}: Operation not permitted` : "");
      return { status: "completed", sessionId: token };
    });
  }
  console.log(`${providerLabel}${model ? `（${model}）` : ""}: ${label}を確認します。`);
  try {
    await runner.send(chat.id, [
      "これはサンドボックスの動作検証です。下のコマンドを通常のシェルツールでそのまま一度だけ実行し、結果を報告してください。",
      "指定された3つの検証用ファイル以外に触れず、他のツール、権限の昇格、再試行、別の書き込み手段は使わないでください。",
      command,
    ].join("\n"), { permission_mode: "default" });
    const deadline = Date.now() + 90_000;
    let approved = false;
    while (runner.isBusy(chat.id) && Date.now() < deadline) {
      for (const approval of approvals.list({ chatId: chat.id })) {
        const permitted = !approved && approval.kind === "permission" && approval.tool_name === "Bash" && approval.input.command === command;
        if (permitted) approved = true;
        approvals.resolve(approval.id, permitted ? { action: "allow" } : { action: "deny", message: "検証用コマンド以外は承認しません。" });
      }
      await pause(100);
    }
    assert.ok(!runner.isBusy(chat.id), `${label}: タイムアウト`);
    const current = store.chats.get(chat.id);
    if (current?.status !== "completed") throw new Error(`${label}: ${current?.error ?? current?.status ?? "結果なし"}`);
    assert.ok(existsSync(errorFile), `${label}: コマンドが標準エラーの記録を作りませんでした`);
    const stderr = readFileSync(errorFile, "utf8").trim();
    console.log(stderr.slice(0, 500) || "（標準エラーなし）");
    assert.equal(readFileSync(insideFile, "utf8"), token, `${label}: 作業フォルダ内に書けませんでした`);
    if (sandboxEnabled) {
      assert.equal(existsSync(outsideFile), false, `${label}: 作業フォルダ外に書けてしまいました`);
      assert.match(stderr, /Operation not permitted|Permission denied/i, `${label}: OS の書き込み拒否を確認できませんでした`);
      assert.ok(stderr.includes(outsideFile), `${label}: 拒否されたパスを確認できませんでした`);
    } else {
      assert.equal(stderr, "", `${label}: コマンドが標準エラーを出力しました`);
      assert.equal(readFileSync(outsideFile, "utf8"), token, `${label}: 作業フォルダ外に書けませんでした`);
    }
    console.log(`${label}: 期待どおり`);
  } finally {
    if (runner.isBusy(chat.id)) {
      runner.cancel(chat.id);
      const deadline = Date.now() + 10_000;
      while (runner.isBusy(chat.id) && Date.now() < deadline) await pause(100);
    }
  }
}

try {
  for (const enabled of [true, false]) {
    try {
      await verify(enabled);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
} finally {
  runner.shutdown();
  if (!store.chats.list({ projectId: project.id }).some((chat) => runner.isBusy(chat.id))) store.close();
  console.log(`検証用フォルダ（確認後にゴミ箱へ）: ${workdir} / ${outside}`);
}
