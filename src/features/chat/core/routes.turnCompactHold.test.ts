// API のテスト: 圧縮中に預かった指示（止めずに伝える・消す・書き直す）と圧縮後指示（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { test } from "vitest";
import { setup, until } from "@/app/core/testing/testServer";
import { busyPreCompactMessage, postCompactMessage } from "@shared/chat/prompts";

test("圧縮中に止めずに伝える: 預かって作業中の様子に出し、圧縮したやり取りが終わってから送った順に送る（圧縮のあとも、そのやり取りの間は預かる）。作業ごと終わったら送信待ちより先に送る", async () => {
  const { call, api, project, runner, provider, store } = setup({ features: ["chat", "compact", "settings", "subagents"] });
  const release = provider.hold();
  provider.compacting = true;
  const chatId = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => runner.live(chatId).compacting !== null);
  // 圧縮中: 足さずに預かる（記録にも、送信待ちにも入れない）
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "あ", when: "now" })).body.result, "held");
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "い", when: "now" })).body.result, "held");
  assert.deepEqual(provider.told, []);
  assert.deepEqual((await api("GET /api/chats/:chatId", { params: { chatId: chatId } })).body.live.now.map((m: { text: string }) => m.text), ["あ", "い"]);
  assert.deepEqual(runner.live(chatId).queue.messages, []);
  const users = () => store.events.list(chatId).filter((e) => e.type === "user").map((e) => (e.data as { text: string }).text);
  assert.deepEqual(users(), ["1"]);
  // 圧縮が終わっても、圧縮したやり取りが終わるまでは足さずに預かる（そのあいだに送った「いま」も）
  provider.finishCompacting();
  assert.equal(runner.live(chatId).compaction.done, true);
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "う", when: "now" })).body.result, "held");
  assert.deepEqual(provider.told, []);
  assert.deepEqual(runner.live(chatId).now.map((m) => m.text), ["あ", "い", "う"]);
  // やり取りが終わったら、送った順に送る（1 件目を新しい作業として、残りはその作業に）
  provider.compacting = false;
  release();
  await until(() => runner.live(chatId).now.length === 0 && !runner.isBusy(chatId));
  assert.deepEqual(users(), ["1", "あ", "い", "う"]);
  assert.equal(provider.prompts[1], "あ");
  assert.equal(runner.live(chatId).compaction.done, false);

  // 圧縮中に作業ごと終わった（止めた）: 送信待ちより先に送る
  provider.hold();
  provider.compacting = true;
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "2" } });
  await until(() => runner.live(chatId).compacting !== null);
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "前からの送信待ち", when: "later" } });
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "え", when: "now" })).body.result, "held");
  provider.compacting = false;
  await api("POST /api/chats/:chatId/cancel", { params: { chatId: chatId } });
  await until(() => provider.prompts.at(-1) === "え");
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => m.text), ["前からの送信待ち"]);
  assert.deepEqual(runner.live(chatId).now, []);
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "clear" }] } });
  await api("POST /api/chats/:chatId/cancel", { params: { chatId: chatId } });
  await until(() => !runner.isBusy(chatId));

  // 手で圧縮した実行（圧縮のボタン）には足さず、圧縮の実行が終わってから送る
  const releaseCompact = provider.hold();
  provider.compacting = true;
  await api("POST /api/chats/:chatId/compact", { params: { chatId: chatId } });
  await until(() => runner.live(chatId).compacting !== null);
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "お", when: "now" })).body.result, "held");
  provider.finishCompacting();
  assert.deepEqual(runner.live(chatId).now.map((m) => m.text), ["お"]);
  assert.deepEqual(runner.live(chatId).queue.messages, []);
  provider.compacting = false;
  releaseCompact();
  await until(() => provider.prompts.at(-1) === "お" && !runner.isBusy(chatId));
});

test("圧縮中に預かった「いま」は、送れない終わり方（通信の切断）で作業ごと終わったら、送信待ちの先頭に入れる（前からの送信待ちより先・送った順・出どころの印も残す）", async () => {
  const { call, api, project, runner, provider, network } = setup({ features: ["chat", "compact", "settings", "subagents"] });
  const release = provider.hold();
  provider.compacting = true;
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => runner.live(chatId).compacting !== null);
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "前からの送信待ち", when: "later" } });
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "う", when: "now" })).body.result, "held");
  const from = { chat_id: 99, title: "子" };
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "え", handoff_from: from, when: "now" })).body.result, "held");
  network.online = false;
  provider.networkFailures = 1;
  provider.compacting = false;
  release();
  await until(() => !runner.isBusy(chatId) && runner.live(chatId).now.length === 0);
  const queued = runner.live(chatId).queue.messages;
  assert.deepEqual(queued.map((m) => m.text), ["う", "え", "前からの送信待ち"]);
  assert.deepEqual(queued[1].handoff_from, from);
  // 預かった指示は、まだ伝えていないので自分の発言には残さない
  assert.deepEqual(provider.told, []);
});

test("圧縮中に預かった指示は、送る前なら送らずに消せる（命令の remove。もう送った・ない指示は 404）", async () => {
  const { api, project, runner, provider } = setup({ features: ["chat", "compact", "settings", "subagents"] });
  const release = provider.hold();
  provider.compacting = true;
  const chatId = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => runner.live(chatId).compacting !== null);
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "あ", when: "now" } });
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "い", when: "now" } });
  const [first] = runner.live(chatId).now;
  const remove = () => api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "remove", ids: [first!.id] }] } });
  const removed = await remove();
  assert.equal(removed.status, 200);
  assert.deepEqual(removed.body.now.map((m: { text: string }) => m.text), ["い"]);
  assert.equal((await remove()).status, 404);
  // 圧縮したやり取りが終わったら、残した指示だけを送る
  provider.finishCompacting();
  provider.compacting = false;
  release();
  await until(() => provider.prompts.at(-1) === "い" && !runner.isBusy(chatId));
  assert.deepEqual(provider.prompts, ["1", "い"]);
  assert.deepEqual(runner.live(chatId).now, []);
});

test("預かった指示を書き直している間は、送る順が来てもそこで止め、書き直す（命令の edit）と同じ順のまま送る（もう送ったものは 404）", async () => {
  const { api, project, runner, provider, store } = setup({ features: ["chat", "compact", "settings", "subagents"] });
  const release = provider.hold();
  provider.compacting = true;
  const chatId = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => runner.live(chatId).compacting !== null);
  for (const text of ["あ", "い", "う"]) await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text, when: "now" } });
  const second = runner.live(chatId).now[1]!;
  const editing = () => api("PUT /api/chats/:chatId/queue/editing", { params: { chatId: chatId }, body: { ids: [second.id], lane: "now" } });
  assert.equal((await editing()).status, 200);
  // 書き直している間は、画面と同じく持ち時間より短い間隔で知らせ直す
  const keep = setInterval(() => void editing(), 80);
  try {
    provider.finishCompacting();
    provider.compacting = false;
    release();
    // 「あ」は送り、書き直している「い」から後ろは送らずに待つ
    await until(() => provider.prompts.at(-1) === "あ" && !runner.isBusy(chatId));
    assert.deepEqual(runner.live(chatId).now.map((m) => m.text), ["い", "う"]);
  } finally {
    clearInterval(keep);
  }
  const edit = (text: string) => api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "edit", id: second.id, text, attachments: [] }] } });
  const edited = await edit(" い（直した） ");
  assert.equal(edited.status, 200);
  // 書き直すと書き直し中の印も外れ、同じ順のまま送る
  await until(() => runner.live(chatId).now.length === 0 && !runner.isBusy(chatId));
  const users = store.events
    .list(chatId)
    .filter((e) => e.type === "user")
    .map((e) => (e.data as { text: string }).text);
  assert.deepEqual(users, ["1", "あ", "い（直した）", "う"]);
  assert.equal((await edit("x")).status, 404);
});

test("圧縮後指示: 圧縮が終わったら札付きで伝え、預かった「いま」は圧縮後指示のやり取りが終わってから送る（手で圧縮したときは圧縮の実行のあとに圧縮後指示を新しい作業として送る）", async () => {
  const { call, api, project, runner, provider, store } = setup({ features: ["chat", "compact", "settings", "subagents"] });
  await call("PUT", "/api/settings", { post_compact_prompt: " 共通のあと " });
  await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { post_compact_prompt: "ノートを読み直す" } });
  const text = "共通のあと\n\nノートを読み直す";
  const users = () =>
    store.events
      .list(chatId)
      .filter((e) => e.type === "user")
      .map((e) => (e.type === "user" && e.data.post_compact ? `後:${e.data.text}` : (e.data as { text: string }).text));

  // 作業の途中の自動の圧縮: 圧縮後指示はいまのやり取りに伝え、圧縮中・そのやり取りの間に送った「いま」は、やり取りが終わってから送る
  const release = provider.hold();
  provider.compacting = true;
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => runner.live(chatId).compacting !== null);
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "あ", when: "now" })).body.result, "held");
  provider.compactBoundary();
  await until(() => provider.told.length === 1 && runner.live(chatId).now.length === 1);
  assert.deepEqual(provider.told, [postCompactMessage(text)]);
  assert.deepEqual(users(), ["1", `後:${text}`]);
  assert.deepEqual(runner.live(chatId).now.map((m) => m.text), ["あ"]);
  // 圧縮後指示のやり取りの間も、「いま」は預かる
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "い", when: "now" })).body.result, "held");
  assert.deepEqual(provider.told, [postCompactMessage(text)]);
  provider.compacting = false;
  release();
  await until(() => runner.live(chatId).now.length === 0 && !runner.isBusy(chatId));
  assert.deepEqual(users(), ["1", `後:${text}`, "あ", "い"]);
  const types = store.events.list(chatId).map((e) => e.type).filter((t) => t === "compact" || t === "user");
  assert.deepEqual(types, ["user", "compact", "user", "user", "user"]);
  // やり取りが終わったら、「いま」はまた預からない
  const releaseNext = provider.hold();
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "2" } });
  await until(() => provider.prompts.at(-1) === "2");
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "う", when: "now" })).body.result, "told");
  releaseNext();
  await until(() => !runner.isBusy(chatId));

  // 手で圧縮: 圧縮の実行には足さず、終わってから圧縮後指示を新しい作業として送り、預かった「いま」はその作業が終わってから送る
  provider.emitCompactOnCompact = true;
  const releaseCompact = provider.hold();
  provider.compacting = true;
  await api("POST /api/chats/:chatId/compact", { params: { chatId: chatId } });
  await until(() => runner.live(chatId).compacting !== null);
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "え", when: "now" })).body.result, "held");
  assert.deepEqual(runner.live(chatId).now.map((m) => [m.text, Boolean(m.post_compact)]), [[text, true], ["え", false]]);
  provider.compacting = false;
  releaseCompact();
  // 圧縮後指示の作業は止めておく（その間は「いま」を預かったまま）
  const releasePost = provider.hold();
  await until(() => provider.prompts.at(-1) === postCompactMessage(text));
  assert.deepEqual(runner.live(chatId).now.map((m) => m.text), ["え"]);
  assert.equal(runner.live(chatId).compaction.done, true);
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "お", when: "now" })).body.result, "held");
  assert.ok(!provider.told.includes("え"));
  releasePost();
  await until(() => runner.live(chatId).now.length === 0 && !runner.isBusy(chatId));
  assert.deepEqual(users().slice(-3), [`後:${text}`, "え", "お"]);

  // 圧縮後指示がなければ、圧縮しなかった作業では何も足さない
  await call("PUT", "/api/settings", { post_compact_prompt: null });
  await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { post_compact_prompt: null } });
  const before = provider.prompts.length;
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "3" } });
  await until(() => !runner.isBusy(chatId));
  assert.equal(provider.prompts.length, before + 1);
  assert.ok(!users().slice(-1)[0].startsWith("後:"));
});

test("圧縮前指示・圧縮後指示は送信待ちに入れない: 作業中に手で圧縮すると、圧縮前指示をいまの作業に伝え、終わったら送信待ちより先に圧縮して圧縮後指示を送る", async () => {
  const { call, api, project, store, runner, provider } = setup({ features: ["chat", "compact", "settings", "subagents"] });
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "はじめ" } })).body.id;
  await until(() => !runner.isBusy(chatId));
  await call("PUT", "/api/settings", { pre_compact_prompt: "ノートを書いて", post_compact_prompt: "ノートを読んで" });
  provider.emitCompactOnCompact = true;
  const release = provider.hold();
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "作業" } });
  await until(() => provider.prompts.length === 2);
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "次", when: "later" } });
  assert.equal((await api("POST /api/chats/:chatId/compact", { params: { chatId: chatId } })).status, 200);
  // 圧縮の行で予約せず、いまの作業にそのまま伝える（札付きの自分の発言）。圧縮が終わるまで「いま」は預かる
  assert.deepEqual(provider.told, [busyPreCompactMessage("ノートを書いて")]);
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => (m.compact ? "圧縮" : m.text)), ["次"]);
  assert.equal(runner.live(chatId).compaction.awaiting, true);
  // 画面が「いまの作業が終わったら圧縮します」を出せるよう、作業のあとで圧縮することを配る
  assert.equal(runner.live(chatId).compaction.after_turn, true);
  const user = store.events.list(chatId).findLast((e) => e.type === "user")!;
  assert.ok(user.type === "user" && user.data.pre_compact && user.data.text === "ノートを書いて");
  // もう伝えたので、もう一度押しても足さない（予約になる）
  await api("POST /api/chats/:chatId/compact", { params: { chatId: chatId } });
  assert.equal(provider.told.length, 1);
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "remove", ids: [runner.live(chatId).queue.messages.find((m) => m.compact)!.id] }] } });
  release();
  await until(() => provider.prompts.at(-1) === "次" && !runner.isBusy(chatId));
  assert.deepEqual(provider.prompts.slice(2), ["/compact", postCompactMessage("ノートを読んで"), "次"]);
  assert.equal(runner.live(chatId).compaction.after_turn, false);
  const compacted = store.events.list(chatId).find((e) => e.type === "compact");
  assert.ok(compacted?.type === "compact" && compacted.data.trigger === "manual");
});

test("圧縮後指示は送信待ちに入れない: いまの作業に足せなければ足せるまで待ち、作業が終わっていれば送信待ち（止めていても）より先に送る。送れない終わり方なら次に送った作業に伝える", async () => {
  const { call, api, project, runner, provider, network } = setup({ features: ["chat", "compact", "settings", "subagents"] });
  await call("PUT", "/api/settings", { post_compact_prompt: "読み直す" });
  const post = postCompactMessage("読み直す");
  const queueTexts = () => runner.live(chatId).queue.messages.map((m) => m.text);

  // 足せるようになったら、いまの作業に伝える
  const release = provider.hold();
  provider.compacting = true;
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => runner.live(chatId).compacting !== null);
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "次", when: "later" } });
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "set_paused", paused: true }] } });
  provider.acceptTell = false;
  provider.compactBoundary();
  await until(() => runner.live(chatId).now.length === 1);
  assert.deepEqual(queueTexts(), ["次"]);
  provider.acceptTell = true;
  await until(() => provider.told.includes(post));
  assert.deepEqual(runner.live(chatId).now, []);

  // 足せないまま作業が終わったら、送信待ちより先に新しい作業として送る（止めている送信待ちは送らない）
  provider.acceptTell = false;
  provider.compactBoundary();
  await until(() => runner.live(chatId).now.length === 1);
  provider.compacting = false;
  release();
  await until(() => provider.prompts.at(-1) === post && !runner.isBusy(chatId));
  assert.deepEqual(queueTexts(), ["次"]);

  // 通信の切断で終わったら、送信待ちに入れずに残し、次に送った作業にそのまま伝える
  const release2 = provider.hold();
  provider.compacting = true;
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "2" } });
  await until(() => runner.live(chatId).compacting !== null);
  provider.compactBoundary();
  await until(() => runner.live(chatId).now.length === 1);
  network.online = false;
  provider.networkFailures = 1;
  provider.compacting = false;
  release2();
  await until(() => !runner.isBusy(chatId));
  assert.deepEqual(queueTexts(), ["次"]);
  assert.deepEqual(runner.live(chatId).now.map((m) => m.post_compact), [true]);
  // 送信待ちを止めているので自動では再開しない。次に自分で送った作業に、そのまま伝える
  network.online = true;
  provider.acceptTell = true;
  const told = provider.told.length;
  const release3 = provider.hold();
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "3" } });
  await until(() => provider.told.length === told + 1);
  release3();
  await until(() => !runner.isBusy(chatId));
  assert.deepEqual([provider.prompts.at(-1), provider.told.at(-1)], ["3", post]);
  assert.deepEqual(runner.live(chatId).now, []);
  assert.deepEqual(queueTexts(), ["次"]);
});

