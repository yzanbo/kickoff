// 利用者のターミナルで `npx tsx scripts/check-codex-uploads.ts` と実行する実機確認（メモの仕様書「0029」の確かめること）。
// Codex が Kickoff の添付の保存先（開発版 Kickoff Dev の uploads/）のファイルを読めるかを、実際のチャットと同じ組み立てで確かめる:
// Runner に macOS の Bash の砂場の決まりを渡し、Auto mode・砂場ありの Codex のチャットに、uploads/ に置いた確認用ファイルを添付として送る。
// 確認用ファイルには無作為な文字列だけを書き、指示には書かない（Codex が実際に読まない限り答えられない）。終わったらファイルを消す。
// メモリ DB と一時フォルダを使い、既存のチャット・設定は変えない。Codex に 1 回問い合わせるので使用枠を使い、Codex の会話履歴にテストが残る。
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Bus } from "../src/core/bus.js";
import { ApprovalCenter } from "../src/core/chat/approvals.js";
import { Runner } from "../src/core/chat/runner.js";
import { UploadStore } from "../src/core/chat/uploads.js";
import { Store } from "../src/core/db/store.js";
import { MACOS_APP_DATA_ROOT } from "../src/core/platform/macos/index.js";
import { macosAgentSandbox } from "../src/core/platform/macos/sandbox.js";
import { createProviders } from "../src/core/providers/index.js";
import { appDataDir } from "../src/core/system/appEnv.js";
import { ScriptedProvider } from "../src/core/testing/fakeProvider.js";
import type { UsageMonitor } from "../src/core/usage/planUsage.js";

const selfTest = process.argv.includes("--self-test");
// 本番は開発版の実際の添付の保存先。スクリプト自体の動作確認では一時フォルダ
const workdir = mkdtempSync(path.join(tmpdir(), "kickoff-codex-uploads-check-"));
const uploadsDir = selfTest ? path.join(workdir, "uploads") : path.join(appDataDir(MACOS_APP_DATA_ROOT, "development"), "uploads");
const bus = new Bus();
const store = new Store(":memory:", (event) => bus.publish(event));
const providers = createProviders();
if (selfTest) {
  // 添付のパスを指示から拾ってファイルを読み、Bash の呼び出しと中身を返す偽の Codex
  providers.codex = new ScriptedProvider(async (params, callbacks) => {
    const file = params.prompt.match(/\/\S+\.txt/)?.[0] ?? "";
    callbacks.emit({ type: "init", session_id: "self-test" });
    callbacks.emit({ type: "tool_use", id: "t1", name: "Bash", input: { command: `cat ${file}` } });
    const text = readFileSync(file, "utf8").trim();
    callbacks.emit({ type: "text", text });
    return { status: "completed", sessionId: "self-test", result: text };
  });
}
const uploads = new UploadStore(uploadsDir);
const usage = { get: async () => ({ available: false }), refresh: async () => ({ available: false }) } as unknown as UsageMonitor;
const runner = new Runner({
  store, approvals: new ApprovalCenter(bus), providers, uploads, usage, bus,
  // 実際のアプリ（startCore）と同じ macOS の砂場の決まり。通信の中継・ゴミ箱は使わない
  bashSandbox: { rules: macosAgentSandbox(), proxyPort: null, trashDir: null },
});
const project = store.projects.create({ name: "添付の読み取り検証", repo_path: workdir, provider: "codex" });
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const token = `KICKOFF_UPLOAD_${randomUUID()}`;
let savedId: string | null = null;

try {
  // モデルは Codex の一覧の既定（CLI の既定のモデルがアカウントで使えないことがあるため）
  const models = selfTest ? [] : (await providers.codex.models?.()) ?? [];
  const model = models.find((m) => m.is_default)?.value ?? models[0]?.value ?? null;
  const chat = store.chats.create({ project_id: project.id, provider: "codex", title: "添付の読み取り検証", status: "completed", permission_mode: "auto", sandbox_enabled: true, model });
  const saved = await uploads.save({ name: "kickoff-upload-check.txt", type: "text/plain", bytes: new TextEncoder().encode(`${token}\n`) });
  savedId = saved.id;
  const file = await uploads.resolve(saved.id);
  console.log(`Codex（モデル: ${model ?? "Codex の既定"}・Auto mode・砂場あり）に、添付の保存先のファイルを読ませます。`);
  console.log(`確認用ファイル: ${file?.path}`);
  await runner.send(chat.id, "添付したテキストファイルをシェルの cat で読み、中身の文字列だけを返してください。読めなかったら、出たエラーの文をそのまま返してください。", { permission_mode: "auto" }, [saved]);
  const deadline = Date.now() + 180_000;
  while (runner.isBusy(chat.id) && Date.now() < deadline) await pause(250);
  if (runner.isBusy(chat.id)) { runner.cancel(chat.id); throw new Error("Codex の応答がタイムアウトしました"); }
  const current = store.chats.get(chat.id);
  const events = store.events.list(chat.id);
  const answer = events.filter((e) => e.type === "text" && !e.data.parent).map((e) => (e.type === "text" ? e.data.text : "")).join("\n");
  const commands = events.filter((e) => e.type === "tool_use" && e.data.name === "Bash").map((e) => (e.type === "tool_use" ? String((e.data.input as { command?: unknown }).command ?? "") : ""));
  console.log(`実行したコマンド: ${commands.length ? commands.join(" / ") : "（なし）"}`);
  console.log(`Codex の返答: ${answer.trim().slice(0, 500) || "（なし）"}`);
  if (current?.status !== "completed") throw new Error(`Codex が完了しませんでした: ${current?.error ?? current?.status ?? "不明"}`);
  if (!answer.includes(token)) throw new Error("返答に確認用ファイルの中身がありません（読めなかった可能性があります。上の返答を確認してください）");
  console.log("成功: Codex は Kickoff の添付の保存先（uploads/）のファイルを読めました。");
} catch (error) {
  console.error(`失敗: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (savedId) await uploads.remove(savedId).catch(() => {});
  runner.shutdown();
  await pause(500);
  store.close();
}
