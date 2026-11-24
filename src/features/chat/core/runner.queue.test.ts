// 実行の受付（Runner）のテスト: 作業中に送った指示の待ちの列（終わったら順に送る・止めた・失敗した・アプリを終える・「いま」と重なったとき・圧縮と消去の行）。起動したときの再開の確かめは runner.resume.test.ts
import assert from "node:assert/strict";
import { test } from "vitest";
import { NotFound } from "@/foundation/core/errors";
import { gatedScript, ScriptedProvider, type Script } from "@/features/ai/core/testing";
import { settle } from "@shared/foundation/testing/async";
import { setupCore, until } from "@/app/core/testing/testCore";

const setup = (script: Script) => setupCore(new ScriptedProvider(script));

test("待ちの列: 作業中に送った指示は列に入り、終わったら順に送る", async () => {
  const { gates, script } = gatedScript();
  const { store, runner, provider, project, bus } = setup(script);
  const published: number[] = [], seen = { rows: "[]" };
  bus.subscribe((e) => { if (e.type !== "chat_live" || JSON.stringify(e.live.queue.messages) === seen.rows) return; seen.rows = JSON.stringify(e.live.queue.messages); published.push(e.live.queue.messages.length); }); // 行が変わった chat_live だけ（段階・状態が変わっても配る）
  const chat = await runner.start({ projectId: project.id, prompt: "1" });
  await until(() => gates.length === 1);
  assert.equal((await runner.message(chat.id, { text: "2", when: "later" })).result, "queued");
  await runner.message(chat.id, { text: "3", when: "later" });
  assert.deepEqual(runner.live(chat.id).queue.messages.map((m) => m.text), ["2", "3"]);
  // 並べ替え: 3 を先頭に
  await runner.queue(chat.id, [{ op: "move", ids: [runner.live(chat.id).queue.messages[1].id], to: { index: 0 } }]);
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
  assert.deepEqual(await runner.message(chat.id, { text: "4", when: "later" }).then((r) => [r.result === "queued", r.id]), [false, null]);
  await until(() => gates.length === 4);
  gates[3]();
});

test("待ちの列: 止めた・失敗したときも次を送り、「すぐ送る」は作業を止めない（伝えられなければ預かり、作業の終わりに送信待ちより先に送る）", async () => {
  const { gates, script } = gatedScript();
  // 足す口はあるが、発言を足せない（断る）偽のプロバイダー
  const { store, runner, provider, project } = setup((params, cb, signal) => (cb.control?.({ tell: () => false, stopTask: async () => {} }), script(params, cb, signal)));
  const chat = await runner.start({ projectId: project.id, prompt: "1" });
  await until(() => gates.length === 1);
  await runner.message(chat.id, { text: "2", when: "later" });
  // 止めても、待ちの次の指示を送る
  runner.cancel(chat.id);
  await until(() => gates.length === 2);
  assert.deepEqual(runner.live(chat.id).queue.messages, []);
  // 作業中に「すぐ送る」→ 止めずに伝える。この偽のプロバイダーは発言を足せないので、送信待ちに戻さず預かる（作業は止めない）
  await runner.message(chat.id, { text: "3", when: "later" });
  await runner.message(chat.id, { text: "4", when: "later" });
  await runner.queueSend(chat.id, { mode: "now", ids: [runner.live(chat.id).queue.messages[1].id] });
  assert.deepEqual(runner.live(chat.id).queue.messages.map((m) => m.text), ["3"]);
  assert.deepEqual(runner.live(chat.id).now.map((m) => m.text), ["4"]);
  assert.equal(runner.live(chat.id).input_closed, true);
  assert.equal(gates.length, 2);
  // 送信待ちを止めていても、預かった指示は送る
  await runner.queue(chat.id, [{ op: "set_paused", paused: true }]);
  // 列にない指示は 404
  await assert.rejects(runner.queue(chat.id, [{ op: "remove", ids: ["nope"] }]), NotFound);
  await assert.rejects(runner.queueSend(chat.id, { mode: "now", ids: ["nope"] }), NotFound);
  // 終わったら、預かった指示を送信待ちより先に送る
  gates[1]();
  await until(() => gates.length === 3);
  assert.deepEqual(provider.calls.map((c) => c.prompt), ["1", "2", "4"]);
  assert.deepEqual(runner.live(chat.id).now, []);
  assert.equal(runner.live(chat.id).input_closed, false);
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
  await runner.message(chat.id, { text: "2", when: "later" });
  runner.shutdown();
  await until(() => !runner.isBusy(chat.id));
  await settle();
  assert.equal(provider.calls.length, 1);
});

test("送信待ちを送っている途中に「いま」で送っても、同じチャットを 2 つ同時に動かさず、どちらの指示も渡る", async () => {
  let running = 0;
  let maxRunning = 0;
  const { store, runner, provider, project } = setup(async () => {
    running++;
    maxRunning = Math.max(maxRunning, running);
    await settle();
    running--;
    return { status: "completed", sessionId: "s1" };
  });
  const chat = await runner.start({ projectId: project.id, prompt: "最初" });
  await until(() => store.chats.get(chat.id)?.status === "completed");
  // 送信待ちの次の指示を送っている（送る準備の途中）ところへ、「いま」で送る
  const results = await Promise.allSettled([runner.message(chat.id, { text: "送信待ちの指示" }), runner.message(chat.id, { text: "いまの指示", when: "now" })]);
  assert.deepEqual(results.map((r) => r.status), ["fulfilled", "fulfilled"]);
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
  const told = runner.message(chat.id, { text: "いまの指示", when: "now" });
  // 指示を組み立てている間に作業が終わる
  release!();
  assert.equal((await told).result, "held");
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
  assert.equal((await runner.message(chat.id, { text: "A", when: "now" })).result, "held");
  // 足せないと分かったあとの「いま」は、足そうとせずに後ろへ預かる
  assert.equal((await runner.message(chat.id, { text: "B", when: "now" })).result, "held");
  assert.deepEqual(runner.live(chat.id).now.map((m) => m.text), ["A", "B"]);
  assert.deepEqual(runner.live(chat.id).queue.messages, []);
  releases[0]();
  // A を新しい作業として送り、B はその作業にも足せないので預かりの先頭に残る
  await until(() => releases.length === 2 && runner.live(chat.id).input_closed);
  await settle();
  assert.deepEqual(runner.live(chat.id).now.map((m) => m.text), ["B"]);
  releases[1]();
  await until(() => releases.length === 3);
  assert.deepEqual(provider.calls.map((c) => c.prompt), ["1", "A", "B"]);
  assert.deepEqual(runner.live(chat.id).now, []);
  releases[2]();
  await until(() => !runner.isBusy(chat.id));
});

test("動かし始めたばかりで足す口がまだないときの「いま」は、預かった時点ですぐ答え、口ができたら足す（預かったままにしない）", async () => {
  const told: string[] = [];
  let release: (() => void) | undefined;
  let openControl: (() => void) | undefined;
  // 口ができるのは「いま」を頼んだあと（時間では決めない。口ができるまで待つ上限はない = 口ができた知らせで足す）
  const { runner, project } = setupCore(
    new ScriptedProvider(async (_p, cb) => {
      // Claude Code を立ち上げている間（足す口がまだない）
      await new Promise<void>((r) => (openControl = r));
      cb.control?.({ tell: (text) => Boolean(told.push(text)), stopTask: async () => {} });
      await new Promise<void>((r) => (release = r));
      cb.control?.(null);
      return { status: "completed", sessionId: "s1" };
    }),
  );
  const chat = await runner.start({ projectId: project.id, prompt: "1" });
  await until(() => openControl !== undefined);
  assert.equal((await runner.message(chat.id, { text: "すぐあと", when: "now" })).result, "held"); // 送った欄を待たせない（親の決め 2026-11-22）
  openControl!();
  await until(() => told.length === 1);
  assert.deepEqual(told, ["すぐあと"]);
  assert.equal(runner.live(chat.id).input_closed, false);
  assert.deepEqual(runner.live(chat.id).now, []);
  await until(() => release !== undefined);
  release!();
  await until(() => !runner.isBusy(chat.id));
});

test("圧縮の予約: 作業中に圧縮を頼むと送信待ちのいちばん上に圧縮の行を入れ、やり取りが終わったら送信待ちより先に圧縮する", async () => {
  const { gates, script } = gatedScript();
  const { runner, provider, project } = setup(script);
  const chat = await runner.start({ projectId: project.id, prompt: "1" });
  await until(() => gates.length === 1);
  await runner.message(chat.id, { text: "2", when: "later" });
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
  await runner.message(chat.id, { text: "2", when: "later" });
  await runner.compact(chat.id);
  runner.queue(chat.id, [{ op: "remove", ids: [runner.live(chat.id).queue.messages[0].id] }]);
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
  const two = await runner.message(chat.id, { text: "2", when: "later" });
  await runner.message(chat.id, { text: "3", when: "later" });
  runner.queue(chat.id, [{ op: "add_action", action: "compact", after: two.id }]);
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
  await runner.queue(chat.id, [{ op: "set_paused", paused: true }]);
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
  await runner.queue(chat.id, [{ op: "set_stops", stops: [] }]);
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
  const two = await runner.message(chat.id, { text: "2", when: "later" });
  await runner.message(chat.id, { text: "3", when: "later" });
  runner.queue(chat.id, [{ op: "add_action", action: "clear", after: two.id }]);
  assert.deepEqual(
    runner.live(chat.id).queue.messages.map((m) => (m.clear ? "消去" : m.text)),
    ["2", "消去", "3"],
  );
  // 書き直せない・まとめる数に数えない
  await assert.rejects(runner.queue(chat.id, [{ op: "edit", id: runner.live(chat.id).queue.messages[1].id, text: "x" }]), /書き直せません/);
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
  await runner.message(chat.id, { text: "2", when: "later" });
  runner.queue(chat.id, [{ op: "add_action", action: "clear", after: null }]);
  const clearRow = runner.live(chat.id).queue.messages[1];
  await runner.queueSend(chat.id, { mode: "now", ids: [clearRow.id] });
  assert.deepEqual(
    runner.live(chat.id).queue.messages.map((m) => (m.clear ? "消去" : m.text)),
    ["消去", "2"],
  );
  // 止めておくと、予約した消去だけが残る
  await runner.queue(chat.id, [{ op: "set_paused", paused: true }]);
  gates[0]();
  await until(() => !runner.isBusy(chat.id));
  assert.equal(store.chats.get(chat.id)?.session_id, "s");
  // 作業していないときの「すぐ送る」はその場で消去する（止めているので、次は送らない）
  await runner.queueSend(chat.id, { mode: "now", ids: [runner.live(chat.id).queue.messages[0].id] });
  assert.equal(store.chats.get(chat.id)?.session_id, null);
  assert.equal(store.chats.get(chat.id)?.context_tokens, null);
  assert.deepEqual(runner.live(chat.id).queue.messages.map((m) => m.text), ["2"]);
  assert.equal(provider.calls.length, 1);
  // もう会話がないので、消去の行を「すぐ送る」と 409 で列に残す
  runner.queue(chat.id, [{ op: "add_action", action: "clear", after: null }]);
  const again = runner.live(chat.id).queue.messages[1];
  await assert.rejects(runner.queueSend(chat.id, { mode: "now", ids: [again.id] }), /消去するコンテキストがありません/);
  assert.equal(runner.live(chat.id).queue.messages.length, 2);
  // 自動で送るに戻すと「2」を新しい会話で送り、そのあとの消去の行は会話ができたあとなので消去する
  await runner.queue(chat.id, [{ op: "set_paused", paused: false }]);
  await until(() => gates.length === 2);
  assert.equal(provider.calls[1].resumeSessionId, null);
  gates[1]();
  await until(() => !runner.isBusy(chat.id) && runner.live(chat.id).queue.messages.length === 0);
  assert.equal(store.chats.get(chat.id)?.session_id, null);
});

