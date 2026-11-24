// AI への指示の文の記録（いくつもの機能が節を足すシステムプロンプト）: 場合ごとの文を __snapshots__/prompts.<場合>.txt に残す。
// 指示を変えたら記録の更新をコミットに含める（1 つの機能の節の場合は、その機能の core/prompts.snapshot.test.ts）
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import type { LinkOpenTarget } from "@shared/settings/types";
import { ScriptedProvider } from "@/features/ai/core/testing";
import { promptRecord } from "@/features/chat/core/testing";
import { matchRecord } from "@/foundation/core/testing/record";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { setupCore, until } from "@/app/core/testing/testCore";
import { visualTurnParts } from "@/features/visuals/core/tools";
import { noteTurnParts } from "@/features/notes/core/turnParts";
import { browserTurnParts } from "@/features/browser/core/index";

/** すぐ終わる台本 */
const done = async () => ({ status: "completed" as const, sessionId: "s", turns: 1 });

// 本物の起動と同じく kickoff-trash・Bash の砂場・ノートのフォルダがあり、プロジェクトに概要と参照資料があるチャット
test("AI への指示の文の記録: plain", async () => {
  const tmp = tempDir({ real: true });
  fs.mkdirSync(path.join(tmp, "spec"));
  fs.writeFileSync(path.join(tmp, "design.png"), "");
  const provider = new ScriptedProvider(done);
  // setupCore は殻だけなので、本物の組み立てと同じく上の機能が実行に足すもの（図と数式・ノート）を足す
  const { store, runner, project } = setupCore(provider, {
    trashCommand: { path: path.join(tmp, "bin", "kickoff-trash"), dir: path.join(tmp, "trash") },
    bashSandbox: { rules: { tempDirs: [tmp], writableDirs: async () => [tmp], unsandboxedCommands: ["npm run dev:*", "brew services start:*"] }, proxyPort: null, trashDir: null },
    contributors: [visualTurnParts(), noteTurnParts({ dirOf: () => path.join(tmp, "ノート"), publish: () => {} })],
  });
  store.projects.update(project.id, {
    description: "概要の 1 行目\n2 行目",
    reference_paths: [
      { path: path.join(tmp, "spec"), kind: "folder" },
      { path: path.join(tmp, "design.png"), kind: "file" },
    ],
  });
  const chat = await runner.start({ projectId: project.id, prompt: "x" });
  await until(() => store.chats.get(chat.id)?.status === "completed");
  await matchRecord("__snapshots__/prompts.plain.txt", promptRecord({ systemPrompt: provider.calls[0].systemPrompt, turnContext: provider.calls[0].turnContext }, [chat.id]));
});

// ブラウザの開き先（Kickoff のブラウザ → 既定のブラウザ）
test("AI への指示の文の記録: browser-hint", async () => {
  const provider = new ScriptedProvider(done);
  const ctx = setupCore(provider, { contributors: [visualTurnParts(), browserTurnParts((): LinkOpenTarget => ctx.store.settings.get().link_open_in)] });
  const { store, runner, project } = ctx;
  const chat = await runner.start({ projectId: project.id, prompt: "ページを開いて" });
  await until(() => store.chats.get(chat.id)?.status === "completed");
  store.settings.update({ link_open_in: "browser" });
  await runner.message(chat.id, { text: "もう一度開いて" });
  await until(() => store.chats.get(chat.id)?.status === "completed" && provider.calls.length === 2);
  await matchRecord(
    "__snapshots__/prompts.browser-hint.txt",
    promptRecord({ "systemPrompt（Kickoff のブラウザ）": provider.calls[0].systemPrompt, "systemPrompt（既定のブラウザ）": provider.calls[1].systemPrompt }, [chat.id]),
  );
});
