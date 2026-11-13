// 実行の受付（Runner）のテスト: 作業中に送った指示の待ちの列（終わったら順に送る・止めた・失敗した・アプリを終える・「いま」と重なったとき）
import assert from "node:assert/strict";
import { test } from "node:test";
import { NotFound } from "../http/errors.js";
import { Runner } from "./runner.js";
import { gatedScript, ScriptedProvider, type Script } from "../testing/fakeProvider.js";
import { setupCore, tick, until } from "../testing/testCore.js";

const setup = (script: Script) => setupCore(new ScriptedProvider(script));

test("待ちの列: 作業中に送った指示は列に入り、終わったら順に送る", async () => {
  const { gates, script } = gatedScript();
  const { store, runner, provider, project, bus } = setup(script);
  const published: number[] = [];
  bus.subscribe((e) => e.type === "chat_live" && published.push(e.live.queue.messages.length));
  const chat = await runner.start({ projectId: project.id, prompt: "1" });
  await until(() => gates.length === 1);
  assert.equal((await runner.queueMessage(chat.id, "2")).queued, true);
  await runner.queueMessage(chat.id, "3");
  assert.deepEqual(runner.live(chat.id).queue.messages.map((m) => m.text), ["2", "3"]);
  // 並べ替え: 3 を先頭に
  await runner.moveQueued(chat.id, runner.live(chat.id).queue.messages[1].id, 0);
  gates[0]();
  await until(() => gates.length === 2);
  assert.equal(provider.calls[1].prompt, "3");
  assert.deepEqual(runner.live(chat.id).queue.messages.map((m) => m.text), ["2"]);
  gates[1]();
  await until(() => gates.length === 3);
  gates[2]();
  await until(() => store.chats.get(chat.id)?.status === "completed" && runner.live(chat.id).queue.messages.length === 0);
  assert.deepEqual(provider.calls.map((c) => c.prompt), ["1", "3", "2"]);
  assert.deepEqual(published, [1, 2, 2, 1, 0]);
  // 作業中でなければすぐ送る
  assert.deepEqual(await runner.queueMessage(chat.id, "4"), { queued: false, id: null });
  await until(() => gates.length === 4);
  gates[3]();
});

test("待ちの列: 止めた・失敗したときも次を送り、「すぐ送る」は作業を止めない（伝えられなければ預かり、作業の終わりに送信待ちより先に送る）", async () => {
  const { gates, script } = gatedScript();
  const { store, runner, provider, project } = setup(script);
  const chat = await runner.start({ projectId: project.id, prompt: "1" });
  await until(() => gates.length === 1);
  await runner.queueMessage(chat.id, "2");
  // 止めても、待ちの次の指示を送る
  runner.cancel(chat.id);
  await until(() => gates.length === 2);
  assert.deepEqual(runner.live(chat.id).queue.messages, []);
  // 作業中に「すぐ送る」→ 止めずに伝える。この偽のプロバイダーは発言を足せないので、送信待ちに戻さず預かる（作業は止めない）
  await runner.queueMessage(chat.id, "3");
  await runner.queueMessage(chat.id, "4");
  await runner.sendQueuedNow(chat.id, runner.live(chat.id).queue.messages[1].id);
  assert.deepEqual(runner.live(chat.id).queue.messages.map((m) => m.text), ["3"]);
  assert.deepEqual(runner.live(chat.id).after_compact.map((m) => m.text), ["4"]);
  assert.equal(runner.live(chat.id).tells_closed, true);
  assert.equal(gates.length, 2);
  // 送信待ちを止めていても、預かった指示は送る
  await runner.setQueuePaused(chat.id, true);
  // 列にない指示は 404
  assert.throws(() => runner.removeQueued(chat.id, "nope"), NotFound);
  await assert.rejects(runner.sendQueuedNow(chat.id, "nope"), NotFound);
  // 終わったら、預かった指示を送信待ちより先に送る
  gates[1]();
  await until(() => gates.length === 3);
  assert.deepEqual(provider.calls.map((c) => c.prompt), ["1", "2", "4"]);
  assert.deepEqual(runner.live(chat.id).after_compact, []);
  assert.equal(runner.live(chat.id).tells_closed, false);
  gates[2]();
  await until(() => store.chats.get(chat.id)?.status === "completed");
  // 送信待ちは止めたまま残る
  assert.deepEqual(runner.live(chat.id).queue.messages.map((m) => m.text), ["3"]);
});

test("待ちの列: アプリを終えるときは送らない", async () => {
  const { gates, script } = gatedScript();
  const { runner, provider, project } = setup(script);
  const chat = await runner.start({ projectId: project.id, prompt: "1" });
  await until(() => gates.length === 1);
  await runner.queueMessage(chat.id, "2");
  runner.shutdown();
  await until(() => !runner.isBusy(chat.id));
  await tick();
  assert.equal(provider.calls.length, 1);
});

test("送信待ちを送っている途中に「いま」で送っても、同じチャットを 2 つ同時に動かさず、どちらの指示も渡る", async () => {
  let running = 0;
  let maxRunning = 0;
  const { store, runner, provider, project } = setup(async () => {
    running++;
    maxRunning = Math.max(maxRunning, running);
    await tick();
    running--;
    return { status: "completed", sessionId: "s1" };
  });
  const chat = await runner.start({ projectId: project.id, prompt: "最初" });
  await until(() => store.chats.get(chat.id)?.status === "completed");
  // 送信待ちの次の指示を送っている（送る準備の途中）ところへ、「いま」で送る
  const results = await Promise.allSettled([runner.send(chat.id, "送信待ちの指示"), runner.tell(chat.id, "いまの指示")]);
  assert.deepEqual(
    results.map((r) => r.status),
    ["fulfilled", "fulfilled"],
  );
  await until(() => !runner.isBusy(chat.id) && provider.calls.length === 3);
  assert.equal(maxRunning, 1);
  // どちらの指示も、別々の実行として Claude Code に渡っている
  assert.match(provider.calls[1].prompt, /送信待ちの指示/);
  assert.match(provider.calls[2].prompt, /いまの指示/);
  assert.deepEqual(
    store.events
      .list(chat.id)
      .filter((e) => e.type === "user")
      .map((e) => (e.data as { text: string }).text),
    ["最初", "送信待ちの指示", "いまの指示"],
  );
});

test("作業が終わるのと同時に「いま」で送って足せなかったときも、預かりに取り残さずに送る", async () => {
  let release: (() => void) | undefined;
  let calls = 0;
  const { store, runner, provider, project } = setup(async (_p, cb) => {
    if (++calls > 1) return { status: "completed", sessionId: "s1" };
    // 作業中に足せる口はあるが、返答を書き終えて閉じている（足せない）
    cb.control?.({ tell: () => false, stopTask: async () => {} });
    await new Promise<void>((r) => (release = r));
    cb.control?.(null);
    return { status: "completed", sessionId: "s1" };
  });
  const chat = await runner.start({ projectId: project.id, prompt: "最初" });
  await until(() => runner.isBusy(chat.id) && release !== undefined);
  const told = runner.tell(chat.id, "いまの指示");
  // 指示を組み立てている間に作業が終わる
  release!();
  assert.equal(await told, "held");
  await until(() => provider.calls.length === 2 && !runner.isBusy(chat.id));
  assert.match(provider.calls[1].prompt, /いまの指示/);
  assert.equal(store.chats.get(chat.id)?.status, "completed");
});

test("足せなかった「いま」は預かった順に送る: 作業の終わりに 1 件目を新しい作業として送り、その作業にも足せなければ残りは預かりの先頭に残して次の終わりに送る", async () => {
  const releases: (() => void)[] = [];
  const { runner, provider, project } = setup(async (_p, cb) => {
    // どの作業も、作業中に足せる口はあるが閉じている（足せない）
    cb.control?.({ tell: () => false, stopTask: async () => {} });
    await new Promise<void>((r) => releases.push(r));
    cb.control?.(null);
    return { status: "completed", sessionId: "s1" };
  });
  const chat = await runner.start({ projectId: project.id, prompt: "1" });
  await until(() => releases.length === 1);
  assert.equal(await runner.tell(chat.id, "A"), "held");
  // 足せないと分かったあとの「いま」は、足そうとせずに後ろへ預かる
  assert.equal(await runner.tell(chat.id, "B"), "held");
  assert.deepEqual(runner.live(chat.id).after_compact.map((m) => m.text), ["A", "B"]);
  assert.deepEqual(runner.live(chat.id).queue.messages, []);
  releases[0]();
  // A を新しい作業として送り、B はその作業にも足せないので預かりの先頭に残る
  await until(() => releases.length === 2 && runner.live(chat.id).tells_closed);
  await tick();
  assert.deepEqual(runner.live(chat.id).after_compact.map((m) => m.text), ["B"]);
  releases[1]();
  await until(() => releases.length === 3);
  assert.deepEqual(provider.calls.map((c) => c.prompt), ["1", "A", "B"]);
  assert.deepEqual(runner.live(chat.id).after_compact, []);
  releases[2]();
  await until(() => !runner.isBusy(chat.id));
});

test("動かし始めたばかりで足す口がまだないときの「いま」は、口ができるまで少し待って足す（預かったままにしない）", async () => {
  const told: string[] = [];
  let release: (() => void) | undefined;
  const { runner, project } = setup(async (_p, cb) => {
    // Claude Code を立ち上げている間（足す口がまだない）
    await new Promise((r) => setTimeout(r, 20));
    cb.control?.({ tell: (text) => Boolean(told.push(text)), stopTask: async () => {} });
    await new Promise<void>((r) => (release = r));
    cb.control?.(null);
    return { status: "completed", sessionId: "s1" };
  });
  const chat = await runner.start({ projectId: project.id, prompt: "1" });
  assert.equal(await runner.tell(chat.id, "すぐあと"), "told");
  assert.deepEqual(told, ["すぐあと"]);
  assert.equal(runner.live(chat.id).tells_closed, false);
  assert.deepEqual(runner.live(chat.id).after_compact, []);
  await until(() => release !== undefined);
  release!();
  await until(() => !runner.isBusy(chat.id));
});

test("圧縮の予約: 作業中に圧縮を頼むと送信待ちのいちばん上に圧縮の行を入れ、やり取りが終わったら送信待ちより先に圧縮する", async () => {
  const { gates, script } = gatedScript();
  const { runner, provider, project } = setup(script);
  const chat = await runner.start({ projectId: project.id, prompt: "1" });
  await until(() => gates.length === 1);
  await runner.queueMessage(chat.id, "2");
  // 作業中に頼むと予約になる（409 にしない）。2 回頼んでも行は 1 つ
  await runner.compact(chat.id);
  await runner.compact(chat.id);
  assert.deepEqual(
    runner.live(chat.id).queue.messages.map((m) => (m.compact ? "圧縮" : m.text)),
    ["圧縮", "2"],
  );
  // 終わったら、送信待ちの「2」より先に圧縮する（始めたら行は列から外れる）
  gates[0]();
  await until(() => gates.length === 2);
  assert.equal(provider.calls[1].prompt, "/compact");
  assert.deepEqual(runner.live(chat.id).queue.messages.map((m) => m.text), ["2"]);
  // 圧縮が終わったら、送信待ちの次を送る
  gates[1]();
  await until(() => gates.length === 3);
  assert.equal(provider.calls[2].prompt, "2");
  gates[2]();
  await until(() => !runner.isBusy(chat.id));
});

test("圧縮の予約: 圧縮の行を消したら、終わっても圧縮せずに送信待ちの次を送る", async () => {
  const { gates, script } = gatedScript();
  const { runner, provider, project } = setup(script);
  const chat = await runner.start({ projectId: project.id, prompt: "1" });
  await until(() => gates.length === 1);
  await runner.queueMessage(chat.id, "2");
  await runner.compact(chat.id);
  runner.removeQueued(chat.id, runner.live(chat.id).queue.messages[0].id);
  gates[0]();
  await until(() => gates.length === 2);
  assert.equal(provider.calls[1].prompt, "2");
  gates[1]();
  await until(() => !runner.isBusy(chat.id));
});

test("送信待ちの圧縮の行: 指示のあいだに挟むと、その順で圧縮してから次を送る。止めていても予約した圧縮は送り、そのあとで止まる", async () => {
  const { gates, script } = gatedScript();
  const { runner, provider, project } = setup(script);
  const chat = await runner.start({ projectId: project.id, prompt: "1" });
  await until(() => gates.length === 1);
  const two = await runner.queueMessage(chat.id, "2");
  await runner.queueMessage(chat.id, "3");
  runner.queueAction(chat.id, "compact", two.id);
  assert.deepEqual(
    runner.live(chat.id).queue.messages.map((m) => (m.compact ? "圧縮" : m.text)),
    ["2", "圧縮", "3"],
  );
  gates[0]();
  await until(() => gates.length === 2);
  assert.equal(provider.calls[1].prompt, "2");
  gates[1]();
  await until(() => gates.length === 3);
  assert.equal(provider.calls[2].prompt, "/compact");
  // 圧縮の最中に止めてから予約する: 止めるのは 1 件目の上の線に置き換わり、予約した圧縮だけは送る
  await runner.setQueuePaused(chat.id, true);
  await runner.compact(chat.id);
  assert.equal(runner.live(chat.id).queue.paused, false);
  assert.deepEqual(runner.live(chat.id).queue.stops, [1]);
  gates[2]();
  await until(() => gates.length === 4);
  assert.equal(provider.calls[3].prompt, "/compact");
  gates[3]();
  // 予約した圧縮のあとは、1 件目の上の線で待つ（止めておくには切り替えない）
  await until(() => !runner.isBusy(chat.id) && runner.live(chat.id).queue.stops[0] === 0);
  assert.equal(runner.live(chat.id).queue.paused, false);
  assert.deepEqual(runner.live(chat.id).queue.messages.map((m) => m.text), ["3"]);
  // 線を消すと、そのまま次を送る
  await runner.setQueueStops(chat.id, []);
  await until(() => gates.length === 5);
  assert.equal(provider.calls[4].prompt, "3");
  gates[4]();
  await until(() => !runner.isBusy(chat.id));
});

test("送信待ちのコンテキスト消去の行: そこまで送ったらセッションを外して記録を残し、次の指示は新しい会話で送る", async () => {
  const { gates, script } = gatedScript();
  const { store, runner, provider, project } = setup(script);
  const chat = await runner.start({ projectId: project.id, prompt: "1" });
  await until(() => gates.length === 1);
  const two = await runner.queueMessage(chat.id, "2");
  await runner.queueMessage(chat.id, "3");
  runner.queueAction(chat.id, "clear", two.id);
  assert.deepEqual(
    runner.live(chat.id).queue.messages.map((m) => (m.clear ? "消去" : m.text)),
    ["2", "消去", "3"],
  );
  // 書き直せない・まとめる数に数えない
  assert.throws(() => runner.editQueued(chat.id, runner.live(chat.id).queue.messages[1].id, "x"), /書き直せません/);
  gates[0]();
  await until(() => gates.length === 2);
  assert.equal(provider.calls[1].resumeSessionId, "s");
  gates[1]();
  // 「2」が終わったら消去して、すぐ「3」を新しい会話で送る
  await until(() => gates.length === 3);
  assert.equal(provider.calls[2].prompt, "3");
  assert.equal(provider.calls[2].resumeSessionId, null);
  assert.equal(store.events.list(chat.id).filter((e) => e.type === "context_cleared").length, 1);
  gates[2]();
  await until(() => !runner.isBusy(chat.id));
  assert.equal(store.chats.get(chat.id)?.session_id, "s");
});

test("送信待ちのコンテキスト消去の行: 作業中の「すぐ送る」はいちばん上へ移して予約し、作業していなければすぐ消去する（会話がなければ 409）", async () => {
  const { gates, script } = gatedScript();
  const { store, runner, provider, project } = setup(script);
  const chat = await runner.start({ projectId: project.id, prompt: "1" });
  await until(() => gates.length === 1);
  await runner.queueMessage(chat.id, "2");
  runner.queueAction(chat.id, "clear");
  const clearRow = runner.live(chat.id).queue.messages[1];
  await runner.sendQueuedNow(chat.id, clearRow.id);
  assert.deepEqual(
    runner.live(chat.id).queue.messages.map((m) => (m.clear ? "消去" : m.text)),
    ["消去", "2"],
  );
  // 止めておくと、予約した消去だけが残る
  await runner.setQueuePaused(chat.id, true);
  gates[0]();
  await until(() => !runner.isBusy(chat.id));
  assert.equal(store.chats.get(chat.id)?.session_id, "s");
  // 作業していないときの「すぐ送る」はその場で消去する（止めているので、次は送らない）
  await runner.sendQueuedNow(chat.id, runner.live(chat.id).queue.messages[0].id);
  assert.equal(store.chats.get(chat.id)?.session_id, null);
  assert.equal(store.chats.get(chat.id)?.context_tokens, null);
  assert.deepEqual(runner.live(chat.id).queue.messages.map((m) => m.text), ["2"]);
  assert.equal(provider.calls.length, 1);
  // もう会話がないので、消去の行を「すぐ送る」と 409 で列に残す
  runner.queueAction(chat.id, "clear");
  const again = runner.live(chat.id).queue.messages[1];
  await assert.rejects(runner.sendQueuedNow(chat.id, again.id), /消去するコンテキストがありません/);
  assert.equal(runner.live(chat.id).queue.messages.length, 2);
  // 自動で送るに戻すと「2」を新しい会話で送り、そのあとの消去の行は会話ができたあとなので消去する
  await runner.setQueuePaused(chat.id, false);
  await until(() => gates.length === 2);
  assert.equal(provider.calls[1].resumeSessionId, null);
  gates[1]();
  await until(() => !runner.isBusy(chat.id) && runner.live(chat.id).queue.messages.length === 0);
  assert.equal(store.chats.get(chat.id)?.session_id, null);
});

test("起動したときの送信待ちの確かめ: 止めておくか・線は保ち、自動で送るまま残った列だけを、答えるまで送らずに聞く（送る / 続けてから送る / 止めておく）", async () => {
  const { store, provider, project, approvals, providers, usage } = setup(async () => ({ status: "completed", sessionId: "s1" }));
  const make = (title: string) => store.chats.create({ project_id: project.id, provider: "claude", title, status: "running", model: null });
  const row = (id: string, text: string) => ({ id, text, options: {}, attachments: [], created_at: "2026-11-07T00:00:00.000Z" });
  const [sendChat, continueChat, pauseChat, pausedChat, stoppedChat] = ["送る", "続ける", "止める", "止めていた", "線で待つ"].map(make);
  store.queues.save({ chatId: sendChat.id, messages: [row("s1", "送る 1"), row("s2", "送る 2")], paused: false, stops: [1] });
  store.queues.save({ chatId: continueChat.id, messages: [row("c1", "続けてから 1")], paused: false, stops: [] });
  store.queues.save({ chatId: pauseChat.id, messages: [row("p1", "止める 1")], paused: false, stops: [] });
  store.queues.save({ chatId: pausedChat.id, messages: [row("q1", "止めていた 1")], paused: true, stops: [] });
  store.queues.save({ chatId: stoppedChat.id, messages: [row("t1", "線で待つ 1")], paused: false, stops: [0] });
  // アプリを終えて起動し直した: 作業中だったチャットは中断（送る・止めるのチャットは作業していなかったことにする）
  store.chats.update(sendChat.id, { status: "completed" });
  store.chats.update(pauseChat.id, { status: "completed" });
  const interrupted = store.chats.recoverInterrupted("中断しました");
  const restarted = new Runner({ store, approvals, providers, usage, interrupted });
  const before = provider.calls.length;

  // 止めていた列・先頭の上の線で待つ列は、終えたときのまま戻して聞かない
  assert.equal(restarted.live(pausedChat.id).queue.paused, true);
  assert.deepEqual([restarted.live(stoppedChat.id).queue.paused, restarted.live(stoppedChat.id).queue.stops], [false, [0]]);
  assert.deepEqual(
    restarted.queueResumes().map((r) => [r.chat_id, r.messages.length, r.messages[0].text, r.interrupted]),
    [
      [sendChat.id, 2, "送る 1", false],
      [continueChat.id, 1, "続けてから 1", true],
      [pauseChat.id, 1, "止める 1", false],
    ],
  );
  // 答えるまでは送らない
  await tick();
  assert.equal(provider.calls.length, before);

  await restarted.resolveQueueResumes([
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
  assert.deepEqual(restarted.queueResumes(), []);
});

test("起動したときの送信待ちの確かめ: 答えるまでは、線を外す・並べ替えても送らず、自動で送る / 止めていますを押したら答えたことにする。止まったところを添える", async () => {
  const { store, provider, project, approvals, providers, usage } = setup(async () => ({ status: "completed", sessionId: "s1" }));
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "見て決める", status: "running", model: null });
  store.events.add(chat.id, { type: "user", text: "テストを直して", message_uuid: "u1" });
  store.events.add(chat.id, { type: "text", text: "直しています。" });
  store.events.add(chat.id, { type: "tool_use", id: "t1", name: "Bash", input: { command: "npm test" } });
  const row = (id: string, text: string) => ({ id, text, options: {}, attachments: [], created_at: "2026-11-07T00:00:00.000Z" });
  store.queues.save({ chatId: chat.id, messages: [row("a", "次 1"), row("b", "次 2")], paused: false, stops: [1] });
  const interrupted = store.chats.recoverInterrupted("中断しました");
  const restarted = new Runner({ store, approvals, providers, usage, interrupted });
  const before = provider.calls.length;

  // 画面に配る様子にも、確かめを待っていることが出る
  assert.deepEqual(restarted.live(chat.id).queue_resume, { interrupted: true });
  const [resume] = restarted.queueResumes();
  assert.deepEqual(
    [resume.messages.map((m) => m.id), resume.stops, resume.last_prompt?.text, resume.last_reply?.text, resume.last_tool?.text],
    [["a", "b"], [1], "テストを直して", "直しています。", "Bash: npm test"],
  );
  // 線を外す・並べ替えても送らない（中身を見て直している途中に送り始めない）
  await restarted.setQueueStops(chat.id, []);
  await restarted.moveQueued(chat.id, "b", 0);
  await tick();
  assert.equal(provider.calls.length, before);
  assert.deepEqual(restarted.live(chat.id).queue.messages.map((m) => m.id), ["b", "a"]);
  // 見出しの「止めています」を押したら、答えたことにする
  await restarted.setQueuePaused(chat.id, true);
  assert.equal(restarted.live(chat.id).queue_resume, null);
  assert.deepEqual(restarted.queueResumes(), []);
});
