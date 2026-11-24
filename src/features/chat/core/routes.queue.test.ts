// API のテスト: 送信待ちの列（入れる・並べ替え・消す・すぐ送る・止めておく・書き直し・まとめる・順に送る・「ここまで」の印・再起動したとき）（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "vitest";
import { ApprovalCenter } from "@/features/chat/core/approvals";
import { Bus } from "@/foundation/core/bus";
import { createChatRunner } from "@/features/chat/core/run/runner";
import { settle } from "@shared/foundation/testing/async";
import { setup, until } from "@/app/core/testing/testServer";
import { EMPTY_QUEUE_STATE } from "@shared/chat/chatLive";

test("待ちの列の API: 作業中は列に入れ、並べ替え・消す・すぐ送る。作業中でなければすぐ送る", async () => {
  const { call, api, project, runner, provider } = setup({ features: ["chat", "queue"] }), release = provider.hold();
  const chatId = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => provider.prompts.length === 1);
  assert.equal((await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { when: "later" } })).status, 400);
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "2", when: "later" })).body.result, "queued");
  const third = (await call("POST", `/api/chats/${chatId}/messages`, { text: "3", when: "later" })).body;
  // 応答は、入れた結果と、入れたあとの送信待ち
  assert.deepEqual([third.result, third.queue.messages.map((m: { text: string }) => m.text)], ["queued", ["2", "3"]]);
  const queue = (await api("GET /api/chats/:chatId", { params: { chatId: chatId } })).body.live.queue.messages as { id: string; text: string }[];
  assert.deepEqual(queue.map((m) => m.text), ["2", "3"]);

  const moved = await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "move", ids: [queue[1].id], to: { index: 0 } }] } });
  assert.deepEqual(moved.body.messages.map((m: { text: string }) => m.text), ["3", "2"]);
  assert.equal((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "move", ids: ["nope"], to: { index: 0 } }] } })).status, 404);
  // 書き換え（空にはできない）
  const edited = await call("POST", `/api/chats/${chatId}/queue`, { commands: [{ op: "edit", id: queue[1].id, text: " 3 を直した " }] });
  assert.equal(edited.body.messages.find((m: { id: string }) => m.id === queue[1].id).text, "3 を直した");
  assert.equal((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "edit", id: queue[1].id, text: "  " }] } })).status, 400);
  assert.equal((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "edit", id: "nope", text: "x" }] } })).status, 404);
  // 添付も置き換えられる（足す・外す）。添付があれば文は空にでき、文も添付もなくなるなら断る
  const image = { kind: "file", id: randomUUID(), name: "a.png", mime: "image/png", size: 10 };
  const withImage = await call("POST", `/api/chats/${chatId}/queue`, { commands: [{ op: "edit", id: queue[1].id, text: "", attachments: [image] }] });
  assert.deepEqual(withImage.body.messages.find((m: { id: string }) => m.id === queue[1].id).attachments, [image]);
  assert.equal((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "edit", id: queue[1].id, text: "", attachments: [] }] } })).status, 400);
  // 添付を省けば今のまま（文だけ直す）。外して元に戻す
  assert.deepEqual((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "edit", id: queue[1].id, text: "3 を直した" }] } })).body.messages[0].attachments, [image]);
  assert.deepEqual((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "edit", id: queue[1].id, text: "3 を直した", attachments: [] }] } })).body.messages[0].attachments, []);
  assert.deepEqual((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "remove", ids: [queue[0].id] }] } })).body, { ...EMPTY_QUEUE_STATE, messages: [{ ...moved.body.messages[0], text: "3 を直した" }], waiting: "busy" });
  assert.equal((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "remove", ids: ["nope"] }] } })).status, 404);
  assert.equal((await api("POST /api/chats/:chatId/queue/send", { params: { chatId: chatId }, body: { mode: "now", ids: ["nope"] } })).status, 404);

  // すぐ送る: 作業中なら止めずに伝える（作業は止めない）
  assert.deepEqual((await api("POST /api/chats/:chatId/queue/send", { params: { chatId: chatId }, body: { mode: "now", ids: [queue[1].id] } })).body.messages, []);
  assert.deepEqual(provider.told, ["3 を直した"]);
  assert.deepEqual(runner.live(chatId).queue.messages, []);
  assert.equal(runner.isBusy(chatId), true);
  release();
  await until(() => !runner.isBusy(chatId));
  // 作業中でなければすぐ送る
  const sent = (await call("POST", `/api/chats/${chatId}/messages`, { text: "4", when: "later" })).body;
  assert.deepEqual([sent.result, sent.queue], ["sent", EMPTY_QUEUE_STATE]);
  await until(() => provider.prompts.length === 2);
  await until(() => !runner.isBusy(chatId));
  // hold: 作業していなくても送らずに、列の最後に足す（止めている送信待ちがあるときの「ためておく」）
  const held = (await call("POST", `/api/chats/${chatId}/messages`, { text: "5", hold: true, when: "later" })).body;
  assert.equal(held.result, "queued");
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => m.text), ["5"]);
  assert.equal(runner.isBusy(chatId), false);
  assert.equal(provider.prompts.length, 2);
});

test("待ちの列は再起動しても残る: 自動で送るのまま読み戻し、起動したときの確かめに並べる（答えるまで送らない）", async () => {
  const { api, project, runner, provider, store } = setup({ features: ["chat", "queue"] });
  const release = provider.hold();
  const chatId = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => provider.prompts.length === 1);
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "2", when: "later" } });
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "3", when: "later" } });
  // アプリを終えて起動し直したことにして、同じデータベースで作り直す
  const restarted = createChatRunner({ store, approvals: new ApprovalCenter(new Bus()), providers: { claude: provider } as never, usage: {} as never });
  assert.deepEqual(restarted.live(chatId).queue.messages.map((m) => m.text), ["2", "3"]);
  assert.equal(restarted.live(chatId).queue.paused, false);
  assert.deepEqual(
    restarted.restartResumes().map((r) => [r.chat_id, r.messages.length, r.messages[0].text]),
    [[chatId, 2, "2"]],
  );
  release();
  await until(() => !runner.isBusy(chatId));
});

test("待ちの列を止めておく API: 終わっても送らず、すぐ送るで 1 件ずつ送れ、戻すと先頭をすぐ送る。空になると自動に戻る", async () => {
  const { api, project, runner, provider } = setup({ features: ["chat", "queue"] });
  const release = provider.hold();
  const chatId = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => provider.prompts.length === 1);
  // 列が空なら止めない
  assert.deepEqual((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "set_paused", paused: true }] } })).body, EMPTY_QUEUE_STATE);
  assert.equal((await api("POST /api/chats/:chatId/queue", { params: { chatId: 999 }, body: { commands: [{ op: "set_paused", paused: true }] } })).status, 404);
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "2", when: "later" } });
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "3", when: "later" } });
  assert.equal((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "set_paused", paused: true }] } })).body.paused, true);
  assert.equal((await api("GET /api/chats/:chatId", { params: { chatId: chatId } })).body.live.queue.paused, true);

  // 終わっても送らない
  release();
  await until(() => !runner.isBusy(chatId));
  await settle();
  assert.equal(provider.prompts.length, 1);
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => m.text), ["2", "3"]);

  // すぐ送るで 1 件だけ送り、終わってもまた止まる
  const [first] = runner.live(chatId).queue.messages;
  await api("POST /api/chats/:chatId/queue/send", { params: { chatId: chatId }, body: { mode: "now", ids: [first.id] } });
  await until(() => provider.prompts.length === 2 && !runner.isBusy(chatId));
  await settle();
  assert.equal(provider.prompts.length, 2);
  assert.equal(runner.live(chatId).queue.paused, true);

  // 自動で送るに戻すと、作業中でなければ先頭をすぐ送り、列が空になったら止めない状態に戻る
  assert.deepEqual((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "set_paused", paused: false }] } })).body, EMPTY_QUEUE_STATE);
  await until(() => provider.prompts.length === 3);
  assert.equal(provider.prompts[2], "3");
  assert.equal(runner.live(chatId).queue.paused, false);
});

test("待ちの列の書き直し: 次に送る指示を書き直している間は送らず、終わったら送る。ほかの指示の書き直し・知らせが途絶えたときは止めない", async () => {
  const { call, api, project, runner, provider } = setup({ features: ["chat", "queue"] });
  const release = provider.hold();
  const chatId = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => provider.prompts.length === 1);
  for (const text of ["2", "3"]) await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text, when: "later" } });
  const [first] = runner.live(chatId).queue.messages;
  assert.equal((await api("PUT /api/chats/:chatId/queue/editing", { params: { chatId: 999 }, body: { ids: [] } })).status, 404);
  assert.equal((await call("PUT", `/api/chats/${chatId}/queue/editing`, {})).status, 400);

  // 次に送る指示（先頭）を書き直している: 終わっても送らない
  assert.equal((await api("PUT /api/chats/:chatId/queue/editing", { params: { chatId: chatId }, body: { ids: [first.id] } })).status, 200);
  release();
  await until(() => !runner.isBusy(chatId));
  await settle();
  assert.equal(provider.prompts.length, 1);
  // 送信の準備ができて、書き直しが終わるのを待っている（画面の案内に使う）
  assert.equal((await api("GET /api/chats/:chatId", { params: { chatId: chatId } })).body.live.queue.waiting_edit, true);

  // 書き直して保存し、欄を閉じた: 書き直した文をすぐ送る
  const release2 = provider.hold();
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "edit", id: first.id, text: "2'" }] } });
  await api("PUT /api/chats/:chatId/queue/editing", { params: { chatId: chatId }, body: { ids: [] } });
  await until(() => provider.prompts.length === 2);
  assert.equal(provider.prompts[1], "2'");
  assert.equal(runner.live(chatId).queue.waiting_edit, false);

  // 先頭でない指示を書き直していても止めない（その指示は、先頭になってから書き直しが終わるのを待つ）
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "4", when: "later" } });
  await api("PUT /api/chats/:chatId/queue/editing", { params: { chatId: chatId }, body: { ids: [runner.live(chatId).queue.messages[1].id] } });
  release2();
  await until(() => provider.prompts.length === 3);
  assert.equal(provider.prompts[2], "3");

  // 知らせが途絶えた（画面を閉じた・落ちた）: 持ち時間で外れて送る
  await until(() => provider.prompts.length === 4);
  assert.equal(provider.prompts[3], "4");
});

test("待ちの列をまとめる API: 選んだ指示を送らずに 1 件にし（列の順に空行でつなぐ）、選んだうちのいちばん上の位置に残す", async () => {
  const { api, project, runner, provider } = setup({ features: ["chat", "queue"] });
  const release = provider.hold();
  const chatId = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => provider.prompts.length === 1);
  for (const text of ["a", "b", "c", "d"]) await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text, when: "later" } });
  const ids = runner.live(chatId).queue.messages.map((m) => m.id);
  // 2 件以上選ばないとまとめない
  assert.equal((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "merge", ids: [ids[0]] }] } })).status, 400);
  assert.equal((await api("POST /api/chats/:chatId/queue", { params: { chatId: 999 }, body: { commands: [{ op: "merge", ids }] } })).status, 404);
  // 選んだ順ではなく、列の順につなぐ
  const merged = await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "merge", ids: [ids[3], ids[1]] }] } });
  assert.equal(merged.status, 200);
  assert.equal(merged.body.messages[1].id, ids[1]);
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => m.text), ["a", "b\n\nd", "c"]);
  // 送ってはいない
  assert.equal(provider.prompts.length, 1);
  release();
});

test("待ちの列を 1 件ずつ順に送る API: まとめずに別々の発言として順に送り、止めておく・「ここまで」の印があっても最後まで送る", async () => {
  const { api, project, runner, provider } = setup({ features: ["chat", "queue"] });
  const release = provider.hold();
  const chatId = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => provider.prompts.length === 1);
  // 送るものがなければ 409（状態による失敗）、チャットがなければ 404
  assert.deepEqual(await api("POST /api/chats/:chatId/queue/send", { params: { chatId: chatId }, body: { mode: "in_order" } }), { status: 409, body: { error: "送信待ちの指示がありません" } });
  assert.equal((await api("POST /api/chats/:chatId/queue/send", { params: { chatId: 999 }, body: { mode: "in_order" } })).status, 404);
  for (const text of ["2", "3", "4"]) await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text, when: "later" } });
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "set_paused", paused: true }] } });
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "set_stops", stops: [1] }] } });
  release();
  await until(() => !runner.isBusy(chatId));

  assert.equal((await api("POST /api/chats/:chatId/queue/send", { params: { chatId: chatId }, body: { mode: "in_order" } })).status, 200);
  assert.equal(runner.live(chatId).queue.paused, false);
  assert.deepEqual(runner.live(chatId).queue.stops, []);
  await until(() => provider.prompts.length === 4 && runner.live(chatId).queue.messages.length === 0 && !runner.isBusy(chatId));
  // 1 つにまとめず、1 件ずつ別々の発言として送る
  assert.deepEqual(provider.prompts.slice(1), ["2", "3", "4"]);
});

test("「ここまで送ったら止めます」: 印は列の中の位置で持ち、いくつでも・1 件目の上にも置ける。印まで送ったら線の所で待ち（止めておくにはしない）、その線を消すと次の印まで送る", async () => {
  const { api, project, runner, provider } = setup({ features: ["chat", "queue"] });
  const release = provider.hold();
  const chatId = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => provider.prompts.length === 1);
  for (const text of ["2", "3", "4", "5"]) await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text, when: "later" } });
  const [, third] = runner.live(chatId).queue.messages;
  // 列にない指示には付けられない
  assert.equal((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "stop_after", id: "nope", stop: true }] } })).status, 404);
  // 「3」のあと（2 件目のあと）に付け、位置をまとめて置き換える（ドラッグ）こともできる
  assert.deepEqual((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "stop_after", id: third.id, stop: true }] } })).body.stops, [2]);
  assert.deepEqual((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "set_stops", stops: [3, 2, 99] }] } })).body.stops, [2, 3, 4]);
  assert.equal((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "set_stops", stops: [-1] }] } })).status, 400);
  assert.deepEqual((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "set_stops", stops: [2, 3] }] } })).body.stops, [2, 3]);
  assert.deepEqual((await api("GET /api/chats/:chatId", { params: { chatId: chatId } })).body.live.queue.stops, [2, 3]);

  // 「3」まで送ったら、残りは送らずに線の所で待つ（印は「4」の上に残り、止めておくにはしない）
  release();
  await until(() => provider.prompts.length === 3 && !runner.isBusy(chatId) && runner.live(chatId).queue.stops[0] === 0);
  assert.equal(runner.live(chatId).queue.paused, false);
  assert.deepEqual(provider.prompts, ["1", "2", "3"]);
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => m.text), ["4", "5"]);
  assert.deepEqual(runner.live(chatId).queue.stops, [0, 1]);

  // 待っている線を × で消すと、そのまま次の印（「4」のあと）まで送って、また線の所で待つ
  // 応答は「4」を送り出したあとの列（「5」の上に印）
  assert.deepEqual((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "set_stops", stops: [1] }] } })).body.stops, [0]);
  await until(() => provider.prompts.length === 4 && !runner.isBusy(chatId) && runner.live(chatId).queue.stops[0] === 0);
  assert.equal(runner.live(chatId).queue.paused, false);
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => m.text), ["5"]);
  assert.deepEqual(runner.live(chatId).queue.stops, [0]);

  // 止めておくにしてから線を消しても送らない。自動に戻すと送る
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "set_paused", paused: true }] } });
  assert.deepEqual((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "set_stops", stops: [] }] } })).body.stops, []);
  await settle();
  assert.equal(provider.prompts.length, 4);
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "set_paused", paused: false }] } });
  await until(() => provider.prompts.length === 5 && !runner.isBusy(chatId));
  assert.deepEqual(runner.live(chatId).queue.messages, []);
});

test("待ちの列の API: すべて消す・まとめて送る（文は空行でつなぎ、添付も合わせる。作業中なら止めずに伝える）", async () => {
  const { api, project, runner, provider } = setup({ features: ["chat", "queue"] });
  const release = provider.hold();
  const chatId = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => provider.prompts.length === 1);
  // 送るものがなければ 409（状態による失敗）
  assert.equal((await api("POST /api/chats/:chatId/queue/send", { params: { chatId: chatId }, body: { mode: "all" } })).status, 409);
  // すべて消す
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "消す", when: "later" } });
  assert.deepEqual((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "clear" }] } })).body, EMPTY_QUEUE_STATE);
  assert.deepEqual((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "clear" }] } })).body.messages, []);
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "A", when: "later" } });
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "B", when: "later" } });
  assert.deepEqual((await api("POST /api/chats/:chatId/queue/send", { params: { chatId: chatId }, body: { mode: "all" } })).body.messages, []);
  assert.deepEqual(provider.told, ["A\n\nB"]);
  assert.deepEqual(runner.live(chatId).queue.messages, []);
  release();
  await until(() => !runner.isBusy(chatId));
});

test("待ちの列の API: 選んだものだけ、まとめて送る・消す・いちばん上か下へ移す（ほかは並びを保つ）", async () => {
  const { call, api, project, runner, provider } = setup({ features: ["chat", "queue"] });
  const release = provider.hold();
  const chatId = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => provider.prompts.length === 1);
  const ids: string[] = [];
  for (const text of ["A", "B", "C", "D", "E"]) ids.push((await call("POST", `/api/chats/${chatId}/messages`, { text, when: "later" })).body.queue.messages.at(-1).id);
  const texts = () => runner.live(chatId).queue.messages.map((m) => m.text);
  // B と D をいちばん上へ、C をいちばん下へ
  assert.equal((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "move", ids: [ids[3], ids[1]], to: "top" }] } })).status, 200);
  assert.deepEqual(texts(), ["B", "D", "A", "C", "E"]);
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "move", ids: [ids[2]], to: "bottom" }] } });
  assert.deepEqual(texts(), ["B", "D", "A", "E", "C"]);
  assert.equal((await call("POST", `/api/chats/${chatId}/queue`, { commands: [{ op: "move", ids: [ids[0]], to: "middle" }] })).status, 400);
  // ドラッグで落とした位置へまとめて移す: B と A を E の前へ（並びは列の順のまま）、null ならいちばん下
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "move", ids: [ids[0], ids[1]], to: { before: ids[4] } }] } });
  assert.deepEqual(texts(), ["D", "B", "A", "E", "C"]);
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "move", ids: [ids[3]], to: { before: null } }] } });
  assert.deepEqual(texts(), ["B", "A", "E", "C", "D"]);
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "move", ids: [ids[3], ids[2]], to: { before: ids[1] } }] } });
  assert.deepEqual(texts(), ["C", "D", "B", "A", "E"]);
  // 元の並び（B D A E C）に戻す
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "move", ids: [ids[2]], to: "bottom" }] } });
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "move", ids: [ids[1]], to: "top" }] } });
  assert.deepEqual(texts(), ["B", "D", "A", "E", "C"]);
  // 止める線のある位置へ落とす: below_stop: false なら線の上（B D | A E C の C を A の前・線の上へ → B D C | A E）。ほかの指示は線の同じ側に残る
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "set_stops", stops: [2] }] } });
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "move", ids: [ids[2]], to: { before: ids[0], below_stop: false } }] } });
  assert.deepEqual(texts(), ["B", "D", "C", "A", "E"]);
  assert.deepEqual(runner.live(chatId).queue.stops, [3]);
  // いちばん上へ移しても、線の上の B・D は線の上のまま（E が線を越えて上へ）
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "move", ids: [ids[4]], to: "top" }] } });
  assert.deepEqual(texts(), ["E", "B", "D", "C", "A"]);
  assert.deepEqual(runner.live(chatId).queue.stops, [4]);
  // 元に戻す（線を外し、B D A E C に）
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "set_stops", stops: [] }] } });
  for (const i of [1, 3, 0, 4, 2]) await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "move", ids: [ids[i]], to: "bottom" }] } });
  assert.deepEqual(texts(), ["B", "D", "A", "E", "C"]);
  // A と E を消す
  assert.deepEqual((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "remove", ids: [ids[0], ids[4], "nai"] }] } })).body.messages.map((m: { text: string }) => m.text), ["B", "D", "C"]);
  assert.deepEqual(texts(), ["B", "D", "C"]);
  assert.equal((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "remove", ids: [] }] } })).status, 400);
  // C と B だけをまとめて送る（列の順につなぐ）。D は残る
  assert.deepEqual((await api("POST /api/chats/:chatId/queue/send", { params: { chatId: chatId }, body: { ids: [ids[2], ids[1]], mode: "all" } })).body.messages.map((m: { text: string }) => m.text), ["D"]);
  assert.deepEqual(provider.told, ["B\n\nC"]);
  assert.deepEqual(texts(), ["D"]);
  assert.equal((await api("POST /api/chats/:chatId/queue/send", { params: { chatId: chatId }, body: { ids: ["nai"], mode: "all" } })).status, 404);
  // 残った D が止めたあとに送られないよう、列を空にしてから止める
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "clear" }] } });
  runner.cancel(chatId);
  await until(() => !runner.isBusy(chatId));
  release();
});

