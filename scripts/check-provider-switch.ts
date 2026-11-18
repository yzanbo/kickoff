// 利用者のターミナルで `npx tsx scripts/check-provider-switch.ts` と実行する実機確認。
// 一時フォルダとメモリ DB を使い、既存の Kickoff チャットや設定は変更しない。
// 両 CLI の通常のアカウントで 3 回 AI に問い合わせるため、使用枠・料金が発生し、CLI の会話履歴にテストが残る。
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Bus } from "../src/core/bus.js";
import { ApprovalCenter } from "../src/core/chat/approvals.js";
import { Runner } from "../src/core/chat/runner.js";
import { UploadStore } from "../src/core/chat/uploads.js";
import { Store } from "../src/core/db/store.js";
import { createProviders } from "../src/core/providers/index.js";
import { ScriptedProvider } from "../src/core/testing/fakeProvider.js";
import type { UsageMonitor } from "../src/core/usage/planUsage.js";

const dir = mkdtempSync(path.join(tmpdir(), "kickoff-provider-switch-check-"));
const bus = new Bus();
const store = new Store(":memory:", (event) => bus.publish(event));
const providers = createProviders();
// スクリプト自体の動作確認用。通常の実行では必ず実際の CLI を使う。
if (process.argv.includes("--self-test")) {
  const fake = new ScriptedProvider(async (params, callbacks) => {
    const id = params.resumeSessionId ?? randomUUID();
    const all = `${params.prompt}\n${params.turnContext ?? ""}`;
    const a = all.match(/KICKOFF_A_[0-9a-f-]{36}/)?.[0];
    const b = all.match(/KICKOFF_B_[0-9a-f-]{36}/)?.[0];
    const answer = [a, b].filter(Boolean).join(" ");
    callbacks.emit({ type: "init", session_id: id });
    callbacks.emit({ type: "text", text: answer });
    return { status: "completed", sessionId: id, result: answer };
  });
  providers.claude = fake;
  providers.codex = fake;
}
const usage = { get: async () => ({ available: false }), refresh: async () => ({ available: false }) } as unknown as UsageMonitor;
const runner = new Runner({ store, approvals: new ApprovalCenter(bus), providers, uploads: new UploadStore(path.join(dir, "uploads")), usage, bus });
const project = store.projects.create({ name: "切り替え検証", repo_path: dir, provider: "claude" });
store.settings.update({ provider_chat_defaults: { codex: { model: "gpt-6.1-sol", effort: null, permission_mode: "plan", fast_mode: false } } });
const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "切り替え検証", status: "completed", permission_mode: "plan" });
const one = `KICKOFF_A_${randomUUID()}`;
const two = `KICKOFF_B_${randomUUID()}`;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function send(text: string, expected: string) {
  const before = store.events.list(chat.id).at(-1)?.id ?? 0;
  await runner.send(chat.id, text, { permission_mode: "plan" });
  const deadline = Date.now() + 180_000;
  while (runner.isBusy(chat.id) && Date.now() < deadline) await pause(250);
  if (runner.isBusy(chat.id)) { runner.cancel(chat.id); throw new Error("AI の応答がタイムアウトしました"); }
  const current = store.chats.get(chat.id);
  if (current?.status !== "completed") throw new Error(`AI が完了しませんでした: ${current?.error ?? current?.status ?? "不明"}`);
  const answer = store.events.after(chat.id, before).filter((event) => event.type === "text" && !event.data.parent).map((event) => event.type === "text" ? event.data.text : "").join("\n");
  if (!answer.includes(expected)) throw new Error("期待した確認文字列が応答にありません");
}

try {
  console.log("Claude Code で最初の会話を開始します。");
  await send(`ツールを使わず、次の文字列だけを返してください: ${one}`, one);
  const original = store.chats.get(chat.id)?.session_id;
  if (!original) throw new Error("Claude Code のセッション ID を確認できません");
  await runner.switchProvider(chat.id, "claude", "codex");
  console.log("Codex に交代し、引き継いだ会話を確認します。");
  await send(`ツールを使わず、直前に Claude Code が返した確認文字列と、次の文字列を両方返してください: ${two}`, one);
  const codexText = store.events.list(chat.id).filter((event) => event.type === "text" && !event.data.parent).at(-1);
  if (!codexText || codexText.type !== "text" || !codexText.data.text.includes(two)) throw new Error("Codex が 2 つ目の確認文字列を返していません");
  await runner.switchProvider(chat.id, "codex", "claude");
  if (store.chats.get(chat.id)?.session_id !== original) throw new Error("以前の Claude Code のセッションが選ばれませんでした");
  console.log("Claude Code に戻し、Codex との会話を引き継げるか確認します。");
  await send("ツールを使わず、直前の Codex の返答にあった KICKOFF_B_ で始まる文字列だけを返してください。", two);
  console.log("成功: Claude Code → Codex → Claude Code の切り替え、引き継ぎ、元のセッションの再開を確認しました。");
} catch (error) {
  console.error(`失敗: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  runner.shutdown();
  const deadline = Date.now() + 10_000;
  while (runner.isBusy(chat.id) && Date.now() < deadline) await pause(100);
  if (!runner.isBusy(chat.id)) store.close();
  console.log(`検証用の一時フォルダ: ${dir}`);
}
