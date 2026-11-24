// AI への指示の文の記録: 場合ごとに、システムプロンプト・指示に添える文脈・送る指示などを test-records/core/prompts/<場合>.txt に残す。
// 作り直しの前後で 1 字も変えない（変わってよいのは語彙の置き換えだけ）
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import type { LinkOpenTarget } from "@shared/settings/types";
import { ScriptedProvider } from "@/features/ai/core/testing";
import { gitRepo } from "@/foundation/core/testing/gitRepo";
import { maskVolatile, matchRecord } from "@/foundation/core/testing/record";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { setupCore, until } from "@/app/core/testing/testCore";
import { setup } from "@/app/core/testing/testServer";
import { visualTurnParts } from "@/features/visuals/core/tools";
import { noteTurnParts } from "@/features/notes/core/turnParts";
import { browserTurnParts } from "@/features/browser/core/index";

/** 本物の組み立てと同じく、上の機能が実行に足すもの（setupCore は殻だけなので、システムプロンプトの図と数式の節を足す） */
const contributors = [visualTurnParts()];

type Ctx = ReturnType<typeof setup>;

/** 文の中のチャット・記録の ID（「ID: 3」「チャット 3」「記録 3」の形）を <ID> に替える（作る順が変わっても記録を変えない） */
function maskIds(text: string, ids: number[]): string {
  const known = new Set(ids.map(String));
  return text.replace(/(ID: |チャット |記録 )(\d+)/g, (whole, head: string, id: string) => (known.has(id) ? `${head}<ID>` : whole));
}

/** 記録の文: 見出しごとの文（ないものは「（なし）」）。一時フォルダ・時刻などとチャットの ID を伏せる */
function promptRecord(parts: Record<string, string | null | undefined>, ids: number[]): string {
  const text = Object.entries(parts)
    .map(([name, value]) => `=== ${name} ===\n${value ?? "（なし）"}\n`)
    .join("\n");
  return maskIds(maskVolatile(text), ids);
}

/** すぐ終わる台本 */
const done = async () => ({ status: "completed" as const, sessionId: "s", turns: 1 });

/** 1 回送って終わったチャットを作る（API） */
async function finishedChat(ctx: Ctx, text = "親の質問") {
  const id: number = (await ctx.api("POST /api/projects/:projectId/chats", { params: { projectId: ctx.project.id }, body: { text } })).body.id;
  await until(() => ctx.store.chats.get(id)?.status === "completed");
  return id;
}

/** 作業が終わるのを待つ */
const idle = (ctx: Ctx, chatId: number) => until(() => !ctx.runner.isBusy(chatId) && ctx.store.chats.get(chatId)?.status !== "running");

/** 記録の場合と、その文の作り方（いまの API・実行のテストと同じ手順） */
const CASES: Record<string, () => Promise<string>> = {
  // 本物の起動と同じく kickoff-trash・Bash の砂場・ノートのフォルダがあり、プロジェクトに概要と参照資料があるチャット
  plain: async () => {
    const tmp = tempDir({ real: true });
    fs.mkdirSync(path.join(tmp, "spec"));
    fs.writeFileSync(path.join(tmp, "design.png"), "");
    const provider = new ScriptedProvider(done);
    const { store, runner, project } = setupCore(provider, {
      trashCommand: { path: path.join(tmp, "bin", "kickoff-trash"), dir: path.join(tmp, "trash") },
      bashSandbox: { rules: { tempDirs: [tmp], writableDirs: async () => [tmp], unsandboxedCommands: ["npm run dev:*", "brew services start:*"] }, proxyPort: null, trashDir: null },
      contributors: [...contributors, noteTurnParts({ dirOf: () => path.join(tmp, "ノート"), publish: () => {} })],
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
    return promptRecord({ systemPrompt: provider.calls[0].systemPrompt, turnContext: provider.calls[0].turnContext }, [chat.id]);
  },
  "child-first": async () => {
    const ctx = setup();
    const parentId = await finishedChat(ctx);
    const answer = ctx.store.events.list(parentId).find((e) => e.type === "result")!;
    const child = (await ctx.api("POST /api/chats/:chatId/children", { params: { chatId: parentId }, body: { text: "これはどういう意味？", quote: "Hono の middleware", inherit: true, event_id: answer.id } })).body;
    await idle(ctx, child.id);
    return promptRecord({ prompt: ctx.provider.prompts.at(-1), turnContext: ctx.provider.lastTurnContext }, [parentId, child.id]);
  },
  "child-no-inherit": async () => {
    const ctx = setup();
    const parentId = await finishedChat(ctx);
    const child = (await ctx.api("POST /api/chats/:chatId/children", { params: { chatId: parentId }, body: { text: "質問", inherit: false } })).body;
    await idle(ctx, child.id);
    return promptRecord({ prompt: ctx.provider.prompts.at(-1), turnContext: ctx.provider.lastTurnContext }, [parentId, child.id]);
  },
  // Markdown のノートと HTML のノートのチャット
  "note-chat": async () => {
    const ctx = setup();
    const systemPrompts: string[] = [];
    for (const [file, content] of [["設計/画面.md", "# 画面\n"], ["資料.html", "<p>x</p>"]]) {
      await ctx.api("POST /api/projects/:projectId/notes", { params: { projectId: ctx.project.id }, body: { path: file, content } });
      const chat = (await ctx.api("POST /api/projects/:projectId/note/chat", { params: { projectId: ctx.project.id }, body: { path: file, text: "相談したい" } })).body;
      await idle(ctx, chat.id);
      systemPrompts.push(ctx.provider.lastSystemPrompt);
    }
    return promptRecord({ "systemPrompt（Markdown のノート）": systemPrompts[0], "systemPrompt（HTML のノート）": systemPrompts[1] }, []);
  },
  // 変更を持って新しいワークツリーへ移したあと、最初に送った指示
  "workplace-moved": async () => {
    const ctx = setup();
    gitRepo({ dir: ctx.project.repo_path, files: { "a.txt": "a\n" } });
    const chatId = await finishedChat(ctx, "こんにちは");
    fs.writeFileSync(path.join(ctx.project.repo_path, "a.txt"), "a changed\n");
    await ctx.api("POST /api/chats/:chatId/workplace", { params: { chatId: chatId }, body: { worktree_path: null, new_worktree_branch: "feat/move", carry: true } });
    await ctx.api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "続けて" } });
    await idle(ctx, chatId);
    return promptRecord({ prompt: ctx.provider.prompts.at(-1), turnContext: ctx.provider.lastTurnContext }, [chatId]);
  },
  // 通信の切断で止まり、つながったら自動で再開する
  "resume-network": async () => {
    const ctx = setup();
    ctx.provider.networkFailures = 1;
    ctx.network.online = false;
    const chatId: number = (await ctx.api("POST /api/projects/:projectId/chats", { params: { projectId: ctx.project.id }, body: { text: "1" } })).body.id;
    await until(() => ctx.runner.live(chatId).reconnect !== null);
    ctx.network.online = true;
    await until(() => ctx.provider.prompts.length === 2 && !ctx.runner.isBusy(chatId));
    return promptRecord({ prompt: ctx.provider.prompts[1], turnContext: ctx.provider.lastTurnContext }, [chatId]);
  },
  // 圧縮前指示（共通 → プロジェクト）: 手で圧縮する前・作業中に手で圧縮したとき・自動の圧縮の前
  "pre-compact": async () => {
    const ctx = setup();
    const chatId = await finishedChat(ctx, "はじめ");
    await ctx.call("PUT", "/api/settings", { pre_compact_prompt: " 共通の指示 " });
    await ctx.api("PATCH /api/projects/:projectId", { params: { projectId: ctx.project.id }, body: { pre_compact_prompt: "プロジェクトの指示" } });
    // 手で圧縮したら要約の記録を残す（残さないと、圧縮するまで次の圧縮前指示を送らない）
    ctx.provider.emitCompactOnCompact = true;
    await ctx.api("POST /api/chats/:chatId/compact", { params: { chatId: chatId } });
    await until(() => ctx.provider.prompts.length === 3 && !ctx.runner.isBusy(chatId));
    const manual = ctx.provider.prompts[1];
    const release = ctx.provider.hold();
    await ctx.api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "作業" } });
    await until(() => ctx.provider.prompts.length === 4);
    await ctx.api("POST /api/chats/:chatId/compact", { params: { chatId: chatId } });
    const busy = ctx.provider.told[0];
    release();
    await until(() => ctx.provider.prompts.at(-1) === "/compact" && !ctx.runner.isBusy(chatId));
    ctx.store.chats.update(chatId, { context_window: 200_000, context_tokens: 120_000 });
    await ctx.api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "続けて" } });
    await idle(ctx, chatId);
    return promptRecord({ "prompt（手で圧縮する前）": manual, "伝える文（作業中に手で圧縮したとき）": busy, "preCompact（自動の圧縮の前）": ctx.provider.preCompacts.at(-1)?.message }, [chatId]);
  },
  // 圧縮後指示（共通 → プロジェクト）: 手で圧縮したあとに新しい作業として送る
  "post-compact": async () => {
    const ctx = setup();
    const chatId = await finishedChat(ctx, "はじめ");
    await ctx.call("PUT", "/api/settings", { post_compact_prompt: " 共通のあと " });
    await ctx.api("PATCH /api/projects/:projectId", { params: { projectId: ctx.project.id }, body: { post_compact_prompt: "ノートを読み直す" } });
    ctx.provider.emitCompactOnCompact = true;
    await ctx.api("POST /api/chats/:chatId/compact", { params: { chatId: chatId } });
    await until(() => ctx.provider.prompts.length === 3 && !ctx.runner.isBusy(chatId));
    return promptRecord({ prompt: ctx.provider.prompts[2], turnContext: ctx.provider.lastTurnContext }, [chatId]);
  },
  // サブエージェントに子チャットで聞く（会話の記録を Markdown の添付にする）
  "subagent-ask": async () => {
    const ctx = setup();
    ctx.provider.emits = [
      { type: "tool_use", id: "tu1", name: "Agent", input: { description: "調査", prompt: "src の構成を調べて", subagent_type: "Explore" } },
      { type: "subagent", task_id: "a1", tool_use_id: "tu1", description: "調査", status: "running" },
      { type: "subagent", task_id: "a1", tool_use_id: "tu1", description: "", status: "completed", summary: "見つけたのは 3 件" },
      { type: "tool_result", tool_use_id: "tu1", content: "見つけたのは 3 件", is_error: false },
    ];
    const parentId = await finishedChat(ctx);
    ctx.provider.emits = [];
    ctx.provider.subagentLogs.a1 = [
      { kind: "user", text: "src の構成を調べて" },
      { kind: "assistant", text: "見ていきます。" },
      { kind: "tool", name: "Bash", input: { command: "ls src" }, result: "core\nrenderer", isError: false },
      { kind: "user", text: "テストも見て" },
    ];
    const child = (await ctx.api("POST /api/chats/:chatId/subagents/:agentId/children", { params: { chatId: parentId, agentId: "a1" }, body: { text: "core には何がある？" } })).body;
    await idle(ctx, child.id);
    const user = ctx.store.events.list(child.id).find((e) => e.type === "user");
    const file = user?.type === "user" ? await ctx.uploads.resolve(user.data.attachments![0].id) : null;
    return promptRecord({ prompt: ctx.provider.prompts.at(-1), turnContext: ctx.provider.lastTurnContext, 添付: file ? fs.readFileSync(file.path, "utf8") : null }, [parentId, child.id]);
  },
  // 子チャットの最後の返答を親チャットに渡して、すぐ送る
  "hand-back": async () => {
    const ctx = setup();
    const parentId = await finishedChat(ctx);
    ctx.provider.emits = [
      { type: "text", text: "確認します" },
      { type: "tool_use", id: "r1", name: "Read", input: { file_path: "a.ts" } },
      { type: "tool_result", tool_use_id: "r1", content: "…", is_error: false },
      { type: "text", text: "子チャット「依頼」で検討した結果、次をお願いします。" },
    ];
    const child = (await ctx.api("POST /api/chats/:chatId/children", { params: { chatId: parentId }, body: { text: "依頼", inherit: false } })).body;
    await idle(ctx, child.id);
    ctx.provider.emits = [];
    const end = ctx.store.events.list(child.id).find((e) => e.type === "result")!;
    await ctx.api("POST /api/chats/:chatId/handoff", { params: { chatId: child.id }, body: { via: "send", turn_event_id: end.id } });
    await idle(ctx, parentId);
    return promptRecord({ prompt: ctx.provider.prompts.at(-1), turnContext: ctx.provider.lastTurnContext }, [parentId, child.id]);
  },
  // Claude Code で 1 回話してから Codex に替え、最初に送った指示（引き継ぐ会話の資料と Git の状態を添える）
  "provider-switch": async () => {
    const ctx = setup();
    gitRepo({ dir: ctx.project.repo_path, files: { "a.txt": "a\n" } });
    fs.writeFileSync(path.join(ctx.project.repo_path, "a.txt"), "a changed\n");
    const chat = ctx.store.chats.create({ project_id: ctx.project.id, provider: "claude", title: "c", status: "completed" });
    ctx.provider.emits = [{ type: "text", text: "最初の答え" }];
    await ctx.api("POST /api/chats/:chatId/messages", { params: { chatId: chat.id }, body: { text: "最初の話" } });
    await idle(ctx, chat.id);
    ctx.provider.emits = [];
    const preview = await ctx.api("GET /api/chats/:chatId/provider-switch", { params: { chatId: chat.id }, query: { target: "codex" } });
    await ctx.api("POST /api/chats/:chatId/provider-switch", { params: { chatId: chat.id }, body: { target: "codex", confirmation: preview.body.confirmation } });
    await ctx.api("POST /api/chats/:chatId/messages", { params: { chatId: chat.id }, body: { text: "Codex への指示" } });
    await until(() => ctx.provider.prompts.length === 2 && !ctx.runner.isBusy(chat.id));
    const eventIds = ctx.store.events.list(chat.id).map((e) => e.id);
    return promptRecord({ prompt: ctx.provider.prompts[1], turnContext: ctx.provider.lastTurnContext }, [chat.id, ...eventIds]);
  },
  // ブラウザの開き先（Kickoff のブラウザ → 既定のブラウザ）
  "browser-hint": async () => {
    const provider = new ScriptedProvider(done);
    const ctx = setupCore(provider, { contributors: [...contributors, browserTurnParts((): LinkOpenTarget => ctx.store.settings.get().link_open_in)] });
    const { store, runner, project } = ctx;
    const chat = await runner.start({ projectId: project.id, prompt: "ページを開いて" });
    await until(() => store.chats.get(chat.id)?.status === "completed");
    store.settings.update({ link_open_in: "browser" });
    await runner.message(chat.id, { text: "もう一度開いて" });
    await until(() => store.chats.get(chat.id)?.status === "completed" && provider.calls.length === 2);
    return promptRecord({ "systemPrompt（Kickoff のブラウザ）": provider.calls[0].systemPrompt, "systemPrompt（既定のブラウザ）": provider.calls[1].systemPrompt }, [chat.id]);
  },
};

for (const [name, text] of Object.entries(CASES)) {
  test(`AI への指示の文の記録: ${name}`, async () => {
    await matchRecord(`core/prompts/${name}.txt`, await text());
  });
}
