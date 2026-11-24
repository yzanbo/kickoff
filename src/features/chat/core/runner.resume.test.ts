// 実行の受付（Runner）のテスト: 起動したときの再開の確かめ（残った送信待ち・作業中だったチャット・答えるまで送らない・アーカイブしたら聞かない）
import assert from "node:assert/strict";
import { test } from "vitest";
import { createChatRunner } from "@/features/chat/core/run/runner";
import { gatedScript, ScriptedProvider, type Script } from "@/features/ai/core/testing";
import { settle } from "@shared/foundation/testing/async";
import { setupCore, until } from "@/app/core/testing/testCore";

const setup = (script: Script) => setupCore(new ScriptedProvider(script));

test("起動したときの再開の確かめ: 止めておくか・線は保ち、自動で送るまま残った列だけを、答えるまで送らずに聞く（送る / 続けてから送る / 止めておく）", async () => {
  const { store, provider, project, approvals, providers, usage } = setup(async () => ({ status: "completed", sessionId: "s1" }));
  const make = (title: string) => store.chats.create({ project_id: project.id, provider: "claude", title, status: "running", model: null });
  const row = (id: string, text: string) => ({ id, text, options: {}, attachments: [], created_at: "2026-11-07T00:00:00.000Z" });
  const [sendChat, continueChat, pauseChat, pausedChat, stoppedChat] = ["送る", "続ける", "止める", "止めていた", "線で待つ"].map(make);
  store.outbox.save(sendChat.id, { now: [], later: [row("s1", "送る 1"), row("s2", "送る 2")], paused: false, stops: [1] });
  store.outbox.save(continueChat.id, { now: [], later: [row("c1", "続けてから 1")], paused: false, stops: [] });
  store.outbox.save(pauseChat.id, { now: [], later: [row("p1", "止める 1")], paused: false, stops: [] });
  store.outbox.save(pausedChat.id, { now: [], later: [row("q1", "止めていた 1")], paused: true, stops: [] });
  store.outbox.save(stoppedChat.id, { now: [], later: [row("t1", "線で待つ 1")], paused: false, stops: [0] });
  // アプリを終えて起動し直した: 作業中だったチャットは中断（続けるのチャットのほかは作業していなかったことにする）
  for (const c of [sendChat, pauseChat, pausedChat, stoppedChat]) store.chats.update(c.id, { status: "completed" });
  const interrupted = store.chats.recoverInterrupted("中断しました");
  const restarted = createChatRunner({ store, approvals, providers, usage, interrupted });
  const before = provider.calls.length;

  // 止めていた列・先頭の上の線で待つ列は、終えたときのまま戻して聞かない
  assert.equal(restarted.live(pausedChat.id).queue.paused, true);
  assert.deepEqual([restarted.live(stoppedChat.id).queue.paused, restarted.live(stoppedChat.id).queue.stops], [false, [0]]);
  assert.deepEqual(
    restarted.restartResumes().map((r) => [r.chat_id, r.messages.length, r.messages[0].text, r.interrupted, r.queued]),
    [
      [sendChat.id, 2, "送る 1", false, true],
      [continueChat.id, 1, "続けてから 1", true, true],
      [pauseChat.id, 1, "止める 1", false, true],
    ],
  );
  // 答えるまでは送らない
  await settle();
  assert.equal(provider.calls.length, before);

  await restarted.resolveRestartResumes([
    { chatId: sendChat.id, action: "send" },
    { chatId: continueChat.id, action: "continue" },
    { chatId: pauseChat.id, action: "pause" },
  ]);
  // 送る: 先頭から送り、一時停止の線（1 件目のあと）で止まる
  await until(() => restarted.live(sendChat.id).queue.messages.length === 1 && !restarted.isBusy(sendChat.id));
  // 続けてから送る: 先に続きを頼み、その作業が終わってから送信待ちを送る
  await until(() => restarted.live(continueChat.id).queue.messages.length === 0 && !restarted.isBusy(continueChat.id));
  const prompts = provider.calls.slice(before).map((c) => c.prompt);
  assert.ok(prompts.includes("送る 1"));
  assert.ok(!prompts.includes("送る 2"));
  const resumeAt = prompts.findIndex((p) => p.includes("アプリの終了で止まったところから"));
  assert.ok(resumeAt >= 0 && prompts.indexOf("続けてから 1") > resumeAt);
  // 止めておく: 止めています にして送らない
  assert.equal(restarted.live(pauseChat.id).queue.paused, true);
  assert.ok(!prompts.includes("止める 1"));
  // 答えたものは、もう聞かない
  assert.deepEqual(restarted.restartResumes(), []);
});

test("起動したときの再開の確かめ: 答えるまでは、線を外す・並べ替えても送らず、自動で送る / 止めていますを押したら送信待ちには答えたことにする（作業を続けるかは聞き続ける）。止まったところを添える", async () => {
  const { store, provider, project, approvals, providers, usage } = setup(async () => ({ status: "completed", sessionId: "s1" }));
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "見て決める", status: "running", model: null });
  store.events.add(chat.id, { type: "user", text: "テストを直して", message_uuid: "u1" });
  store.events.add(chat.id, { type: "text", text: "直しています。" });
  store.events.add(chat.id, { type: "tool_use", id: "t1", name: "Bash", input: { command: "npm test" } });
  const row = (id: string, text: string) => ({ id, text, options: {}, attachments: [], created_at: "2026-11-07T00:00:00.000Z" });
  store.outbox.save(chat.id, { now: [], later: [row("a", "次 1"), row("b", "次 2")], paused: false, stops: [1] });
  const interrupted = store.chats.recoverInterrupted("中断しました");
  const restarted = createChatRunner({ store, approvals, providers, usage, interrupted });
  const before = provider.calls.length;

  // 画面に配る様子にも、確かめを待っていることが出る
  assert.deepEqual(restarted.live(chat.id).restart_resume, { interrupted: true, queued: true });
  const [resume] = restarted.restartResumes();
  assert.deepEqual(
    [resume.messages.map((m) => m.id), resume.stops, resume.last_prompt?.text, resume.last_reply?.text, resume.last_tool?.text],
    [["a", "b"], [1], "テストを直して", "直しています。", "Bash: npm test"],
  );
  // 線を外す・並べ替えても送らない（中身を見て直している途中に送り始めない）
  await restarted.queue(chat.id, [{ op: "set_stops", stops: [] }]);
  await restarted.queue(chat.id, [{ op: "move", ids: ["b"], to: { index: 0 } }]);
  await settle();
  assert.equal(provider.calls.length, before);
  assert.deepEqual(restarted.live(chat.id).queue.messages.map((m) => m.id), ["b", "a"]);
  // 見出しの「止めています」を押したら、送信待ちには答えたことにする（作業を続けるかは聞き続ける）
  await restarted.queue(chat.id, [{ op: "set_paused", paused: true }]);
  assert.deepEqual(restarted.live(chat.id).restart_resume, { interrupted: true, queued: false });
  assert.deepEqual(
    restarted.restartResumes().map((r) => [r.chat_id, r.queued, r.messages.length]),
    [[chat.id, false, 0]],
  );
});

test("起動したときの再開の確かめ: アプリを終えるときに作業中だったチャットに印を付け、送信待ちがなくても聞く（続ける / 止めたまま / あとで）", async () => {
  const { gates, script } = gatedScript();
  const { store, runner, provider, project, approvals, providers, usage } = setup(script);
  const continued = await runner.start({ projectId: project.id, prompt: "調べて" });
  const paused = await runner.start({ projectId: project.id, prompt: "直して" });
  const later = await runner.start({ projectId: project.id, prompt: "書いて" });
  await until(() => gates.length === 3);
  // 続けるチャットでは、サブエージェントが動いている途中だった
  store.events.add(continued.id, { type: "tool_use", id: "task1", name: "Agent", input: { description: "下調べ", prompt: "README を読む" } });
  store.events.add(continued.id, { type: "subagent", tool_use_id: "task1", task_id: "agent-1", description: "下調べ", status: "running" });
  // アプリを終える: 止めると中断で終わり、作業中のまま残らない
  runner.shutdown();
  await until(() => [continued, paused, later].every((c) => store.chats.get(c.id)?.status === "cancelled"));
  const interrupted = store.chats.recoverInterrupted("中断しました");
  assert.deepEqual(interrupted, [continued.id, paused.id, later.id]);

  const restarted = createChatRunner({ store, approvals, providers, usage, interrupted });
  const before = provider.calls.length;
  assert.deepEqual(restarted.live(paused.id).restart_resume, { interrupted: true, queued: false });
  const resumes = restarted.restartResumes();
  assert.deepEqual(
    resumes.map((r) => [r.chat_id, r.interrupted, r.queued, r.messages.length, r.last_prompt?.text]),
    [
      [continued.id, true, false, 0, "調べて"],
      [paused.id, true, false, 0, "直して"],
      [later.id, true, false, 0, "書いて"],
    ],
  );
  assert.deepEqual(resumes[0].subagents, [{ description: "下調べ", agent_id: "agent-1" }]);
  // 送信待ちのないチャットに「送る」は選べない（どれも変えない）
  await assert.rejects(
    restarted.resolveRestartResumes([
      { chatId: paused.id, action: "pause" },
      { chatId: later.id, action: "send" },
    ]),
    /送信待ちのないチャットには/,
  );
  assert.equal(restarted.restartResumes().length, 3);

  await restarted.resolveRestartResumes([
    { chatId: continued.id, action: "continue" },
    { chatId: paused.id, action: "pause" },
  ]);
  // 続ける: 止まったサブエージェントの名前と ID を添えて、続きを頼む
  await until(() => gates.length === 4);
  const prompt = provider.calls.at(-1)!.prompt;
  assert.match(prompt, /アプリの終了で止まったところから/);
  assert.match(prompt, /- 「下調べ」（ID: agent-1）/);
  assert.equal(provider.calls.length, before + 1);
  gates[3]();
  await until(() => !restarted.isBusy(continued.id));
  // 止めたまま: 何も送らない。答えなかった（あとで）チャットだけ、待ったまま
  assert.equal(store.chats.get(paused.id)?.status, "cancelled");
  assert.deepEqual(restarted.restartResumes().map((r) => r.chat_id), [later.id]);
  // 次に起動しても、答えなかったチャットだけを聞く
  assert.deepEqual(store.chats.recoverInterrupted("中断しました"), [later.id]);
});

test("起動したときの再開の確かめ: 自分で送ったら作業を続けるかは聞かない（印も外す）。落ちて作業中のまま残ったチャットも聞く", async () => {
  const { store, project, approvals, providers, usage } = setup(async () => ({ status: "completed", sessionId: "s1" }));
  const crashed = store.chats.create({ project_id: project.id, provider: "claude", title: "落ちた", status: "running", model: null });
  const interrupted = store.chats.recoverInterrupted("中断しました");
  assert.deepEqual(interrupted, [crashed.id]);
  const restarted = createChatRunner({ store, approvals, providers, usage, interrupted });
  assert.deepEqual(restarted.live(crashed.id).restart_resume, { interrupted: true, queued: false });
  await restarted.message(crashed.id, { text: "続きを進めて" });
  assert.equal(restarted.live(crashed.id).restart_resume, null);
  await until(() => !restarted.isBusy(crashed.id));
  assert.deepEqual(restarted.restartResumes(), []);
  assert.deepEqual(store.chats.recoverInterrupted("中断しました"), []);
});

test("起動したときの再開の確かめ: アーカイブしたら（子チャットが親と一緒にしまわれても）聞かず、印も外れて戻しても聞かない。送信待ちは残して送らない", async () => {
  const { store, project, approvals, providers, usage, provider } = setup(async () => ({ status: "completed", sessionId: "s1" }));
  const make = (title: string, parent: number | null = null) =>
    store.chats.create({ project_id: project.id, provider: "claude", title, status: "running", model: null, parent_chat_id: parent });
  const parent = make("親");
  const child = make("子", parent.id);
  const kept = make("残す");
  const row = (id: string, text: string) => ({ id, text, options: {}, attachments: [], created_at: "2026-11-16T00:00:00.000Z" });
  store.outbox.save(parent.id, { now: [], later: [row("a", "次")], paused: false, stops: [] });
  const interrupted = store.chats.recoverInterrupted("中断しました");
  assert.deepEqual(interrupted, [parent.id, child.id, kept.id]);
  const restarted = createChatRunner({ store, approvals, providers, usage, interrupted });
  assert.deepEqual(restarted.restartResumes().map((r) => r.chat_id), [parent.id, child.id, kept.id]);

  // 親をアーカイブする（子も一緒にしまわれる）: 一覧から外れ、作業中の様子からも確かめを待つ印が消える
  store.chats.archive(parent.id, true);
  assert.deepEqual(restarted.restartResumes().map((r) => r.chat_id), [kept.id]);
  assert.equal(restarted.live(parent.id).restart_resume, null);
  assert.equal(restarted.live(child.id).restart_resume, null);
  // 送信待ちは消さず、送り始めもしない
  assert.deepEqual(restarted.live(parent.id).queue.messages.map((m) => m.text), ["次"]);
  await settle();
  assert.equal(provider.calls.length, 0);
  // DB の印も外れる: 戻しても、次の起動でも聞かない
  store.chats.archive(parent.id, false);
  assert.deepEqual(restarted.restartResumes().map((r) => r.chat_id), [kept.id]);
  assert.deepEqual(store.chats.recoverInterrupted("中断しました"), [kept.id]);
});
