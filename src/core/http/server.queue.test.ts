// API のテスト: 送信待ちの列（入れる・並べ替え・消す・すぐ送る・止めておく・書き直し・まとめる・順に送る・「ここまで」の印・再起動したとき）（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { ApprovalCenter } from "../chat/approvals.js";
import { Bus } from "../bus.js";
import { Runner } from "../chat/runner.js";
import { setup, until } from "../testing/testServer.js";

test("待ちの列の API: 作業中は列に入れ、並べ替え・消す・すぐ送る。作業中でなければすぐ送る", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  assert.equal((await call("POST", `/api/chats/${chatId}/queue`, {})).status, 400);
  assert.equal((await call("POST", `/api/chats/${chatId}/queue`, { text: "2" })).body.queued, true);
  const third = (await call("POST", `/api/chats/${chatId}/queue`, { text: "3" })).body;
  assert.equal(third.queued, true);
  assert.equal(typeof third.id, "string");
  // 応答は、入れたあとの送信待ち（入れた指示の ID を添える）
  assert.deepEqual(
    third.messages.map((m: { id: string; text: string }) => [m.text, m.id === third.id]),
    [
      ["2", false],
      ["3", true],
    ],
  );
  const queue = (await call("GET", `/api/chats/${chatId}`)).body.live.queue.messages as { id: string; text: string }[];
  assert.deepEqual(queue.map((m) => m.text), ["2", "3"]);

  const moved = await call("POST", `/api/chats/${chatId}/queue/${queue[1].id}/move`, { index: 0 });
  assert.deepEqual(moved.body.messages.map((m: { text: string }) => m.text), ["3", "2"]);
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/nope/move`, { index: 0 })).status, 404);
  // 書き換え（空にはできない）
  const edited = await call("PATCH", `/api/chats/${chatId}/queue/${queue[1].id}`, { text: " 3 を直した " });
  assert.equal(edited.body.messages.find((m: { id: string }) => m.id === queue[1].id).text, "3 を直した");
  assert.equal((await call("PATCH", `/api/chats/${chatId}/queue/${queue[1].id}`, { text: "  " })).status, 400);
  assert.equal((await call("PATCH", `/api/chats/${chatId}/queue/nope`, { text: "x" })).status, 404);
  // 添付も置き換えられる（足す・外す）。添付があれば文は空にでき、文も添付もなくなるなら断る
  const image = { id: randomUUID(), name: "a.png", mime: "image/png", size: 10 };
  const withImage = await call("PATCH", `/api/chats/${chatId}/queue/${queue[1].id}`, { text: "", attachments: [image] });
  assert.deepEqual(withImage.body.messages.find((m: { id: string }) => m.id === queue[1].id).attachments, [image]);
  assert.equal((await call("PATCH", `/api/chats/${chatId}/queue/${queue[1].id}`, { text: "", attachments: [] })).status, 400);
  // 添付を省けば今のまま（文だけ直す）。外して元に戻す
  assert.deepEqual((await call("PATCH", `/api/chats/${chatId}/queue/${queue[1].id}`, { text: "3 を直した" })).body.messages[0].attachments, [image]);
  assert.deepEqual((await call("PATCH", `/api/chats/${chatId}/queue/${queue[1].id}`, { text: "3 を直した", attachments: [] })).body.messages[0].attachments, []);
  assert.deepEqual((await call("DELETE", `/api/chats/${chatId}/queue/${queue[0].id}`)).body, { messages: [{ ...moved.body.messages[0], text: "3 を直した" }], paused: false, stops: [], waiting_edit: false });
  assert.equal((await call("DELETE", `/api/chats/${chatId}/queue/nope`)).status, 404);
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/nope/send`)).status, 404);

  // すぐ送る: 作業中なら止めずに伝える（作業は止めない）
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/queue/${queue[1].id}/send`)).body.messages, []);
  assert.deepEqual(provider.told, ["3 を直した"]);
  assert.deepEqual(runner.live(chatId).queue.messages, []);
  assert.equal(runner.isBusy(chatId), true);
  release();
  await until(() => !runner.isBusy(chatId));
  // 作業中でなければすぐ送る
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/queue`, { text: "4" })).body, { messages: [], paused: false, stops: [], waiting_edit: false, queued: false, id: null });
  await until(() => provider.prompts.length === 2);
  await until(() => !runner.isBusy(chatId));
  // hold: 作業していなくても送らずに、列の最後に足す（止めている送信待ちがあるときの「ためておく」）
  const held = (await call("POST", `/api/chats/${chatId}/queue`, { text: "5", hold: true })).body;
  assert.equal(held.queued, true);
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => m.text), ["5"]);
  assert.equal(runner.isBusy(chatId), false);
  assert.equal(provider.prompts.length, 2);
});

test("待ちの列は再起動しても残る: 読み戻した列は止めておき、作業が終わっても送らない", async () => {
  const { call, project, runner, provider, store } = setup();
  const release = provider.hold();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  await call("POST", `/api/chats/${chatId}/queue`, { text: "2" });
  await call("POST", `/api/chats/${chatId}/queue`, { text: "3" });
  // アプリを終えて起動し直したことにして、同じデータベースで作り直す
  const restarted = new Runner({ store, approvals: new ApprovalCenter(new Bus()), providers: { claude: provider } as never, usage: {} as never });
  assert.deepEqual(restarted.live(chatId).queue.messages.map((m) => m.text), ["2", "3"]);
  assert.equal(restarted.live(chatId).queue.paused, true);
  release();
  await until(() => !runner.isBusy(chatId));
});

test("待ちの列を止めておく API: 終わっても送らず、すぐ送るで 1 件ずつ送れ、戻すと先頭をすぐ送る。空になると自動に戻る", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  // 列が空なら止めない
  assert.deepEqual((await call("PUT", `/api/chats/${chatId}/queue/paused`, { paused: true })).body, { messages: [], paused: false, stops: [], waiting_edit: false });
  assert.equal((await call("PUT", `/api/chats/${chatId}/queue/paused`, {})).status, 400);
  assert.equal((await call("PUT", "/api/chats/999/queue/paused", { paused: true })).status, 404);
  await call("POST", `/api/chats/${chatId}/queue`, { text: "2" });
  await call("POST", `/api/chats/${chatId}/queue`, { text: "3" });
  assert.equal((await call("PUT", `/api/chats/${chatId}/queue/paused`, { paused: true })).body.paused, true);
  assert.equal((await call("GET", `/api/chats/${chatId}`)).body.live.queue.paused, true);

  // 終わっても送らない
  release();
  await until(() => !runner.isBusy(chatId));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(provider.prompts.length, 1);
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => m.text), ["2", "3"]);

  // すぐ送るで 1 件だけ送り、終わってもまた止まる
  const [first] = runner.live(chatId).queue.messages;
  await call("POST", `/api/chats/${chatId}/queue/${first.id}/send`);
  await until(() => provider.prompts.length === 2 && !runner.isBusy(chatId));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(provider.prompts.length, 2);
  assert.equal(runner.live(chatId).queue.paused, true);

  // 自動で送るに戻すと、作業中でなければ先頭をすぐ送り、列が空になったら止めない状態に戻る
  assert.deepEqual((await call("PUT", `/api/chats/${chatId}/queue/paused`, { paused: false })).body, { messages: [], paused: false, stops: [], waiting_edit: false });
  await until(() => provider.prompts.length === 3);
  assert.equal(provider.prompts[2], "3");
  assert.equal(runner.live(chatId).queue.paused, false);
});

test("待ちの列の書き直し: 次に送る指示を書き直している間は送らず、終わったら送る。ほかの指示の書き直し・知らせが途絶えたときは止めない", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  for (const text of ["2", "3"]) await call("POST", `/api/chats/${chatId}/queue`, { text });
  const [first] = runner.live(chatId).queue.messages;
  assert.equal((await call("PUT", "/api/chats/999/queue/editing", { ids: [] })).status, 404);
  assert.equal((await call("PUT", `/api/chats/${chatId}/queue/editing`, {})).status, 400);

  // 次に送る指示（先頭）を書き直している: 終わっても送らない
  assert.equal((await call("PUT", `/api/chats/${chatId}/queue/editing`, { ids: [first.id] })).status, 200);
  release();
  await until(() => !runner.isBusy(chatId));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(provider.prompts.length, 1);
  // 送信の準備ができて、書き直しが終わるのを待っている（画面の案内に使う）
  assert.equal((await call("GET", `/api/chats/${chatId}`)).body.live.queue.waiting_edit, true);

  // 書き直して保存し、欄を閉じた: 書き直した文をすぐ送る
  const release2 = provider.hold();
  await call("PATCH", `/api/chats/${chatId}/queue/${first.id}`, { text: "2'" });
  await call("PUT", `/api/chats/${chatId}/queue/editing`, { ids: [] });
  await until(() => provider.prompts.length === 2);
  assert.equal(provider.prompts[1], "2'");
  assert.equal(runner.live(chatId).queue.waiting_edit, false);

  // 先頭でない指示を書き直していても止めない（その指示は、先頭になってから書き直しが終わるのを待つ）
  await call("POST", `/api/chats/${chatId}/queue`, { text: "4" });
  await call("PUT", `/api/chats/${chatId}/queue/editing`, { ids: [runner.live(chatId).queue.messages[1].id] });
  release2();
  await until(() => provider.prompts.length === 3);
  assert.equal(provider.prompts[2], "3");

  // 知らせが途絶えた（画面を閉じた・落ちた）: 持ち時間で外れて送る
  await until(() => provider.prompts.length === 4);
  assert.equal(provider.prompts[3], "4");
});

test("待ちの列をまとめる API: 選んだ指示を送らずに 1 件にし（列の順に空行でつなぐ）、選んだうちのいちばん上の位置に残す", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  for (const text of ["a", "b", "c", "d"]) await call("POST", `/api/chats/${chatId}/queue`, { text });
  const ids = runner.live(chatId).queue.messages.map((m) => m.id);
  // 2 件以上選ばないとまとめない
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/merge`, { ids: [ids[0]] })).status, 400);
  assert.equal((await call("POST", "/api/chats/999/queue/merge", { ids })).status, 404);
  // 選んだ順ではなく、列の順につなぐ
  const merged = await call("POST", `/api/chats/${chatId}/queue/merge`, { ids: [ids[3], ids[1]] });
  assert.equal(merged.status, 200);
  assert.equal(merged.body.id, ids[1]);
  assert.deepEqual(
    runner.live(chatId).queue.messages.map((m) => m.text),
    ["a", "b\n\nd", "c"],
  );
  // 送ってはいない
  assert.equal(provider.prompts.length, 1);
  release();
});

test("待ちの列を 1 件ずつ順に送る API: まとめずに別々の発言として順に送り、止めておく・「ここまで」の印があっても最後まで送る", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  // 送るものがなければ 409（状態による失敗）、チャットがなければ 404
  assert.deepEqual(await call("POST", `/api/chats/${chatId}/queue/send-in-order`), { status: 409, body: { error: "送信待ちの指示がありません" } });
  assert.equal((await call("POST", "/api/chats/999/queue/send-in-order")).status, 404);
  for (const text of ["2", "3", "4"]) await call("POST", `/api/chats/${chatId}/queue`, { text });
  await call("PUT", `/api/chats/${chatId}/queue/paused`, { paused: true });
  await call("PUT", `/api/chats/${chatId}/queue/stops`, { stops: [1] });
  release();
  await until(() => !runner.isBusy(chatId));

  assert.equal((await call("POST", `/api/chats/${chatId}/queue/send-in-order`)).status, 200);
  assert.equal(runner.live(chatId).queue.paused, false);
  assert.deepEqual(runner.live(chatId).queue.stops, []);
  await until(() => provider.prompts.length === 4 && runner.live(chatId).queue.messages.length === 0 && !runner.isBusy(chatId));
  // 1 つにまとめず、1 件ずつ別々の発言として送る
  assert.deepEqual(provider.prompts.slice(1), ["2", "3", "4"]);
});

test("「ここまで送ったら止めます」: 印は列の中の位置で持ち、いくつでも・1 件目の上にも置ける。印まで送って止め、自動に戻すと次の印まで送る", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  for (const text of ["2", "3", "4", "5"]) await call("POST", `/api/chats/${chatId}/queue`, { text });
  const [, third] = runner.live(chatId).queue.messages;
  // 列にない指示には付けられない
  assert.equal((await call("PUT", `/api/chats/${chatId}/queue/stop-after`, { id: "nope" })).status, 404);
  assert.equal((await call("PUT", `/api/chats/${chatId}/queue/stop-after`, {})).status, 400);
  // 「3」のあと（2 件目のあと）に付け、位置をまとめて置き換える（ドラッグ）こともできる
  assert.deepEqual((await call("PUT", `/api/chats/${chatId}/queue/stop-after`, { id: third.id })).body.stops, [2]);
  assert.deepEqual((await call("PUT", `/api/chats/${chatId}/queue/stops`, { stops: [3, 2, 99] })).body.stops, [2, 3, 4]);
  assert.equal((await call("PUT", `/api/chats/${chatId}/queue/stops`, { stops: [-1] })).status, 400);
  assert.deepEqual((await call("PUT", `/api/chats/${chatId}/queue/stops`, { stops: [2, 3] })).body.stops, [2, 3]);
  assert.deepEqual((await call("GET", `/api/chats/${chatId}`)).body.live.queue.stops, [2, 3]);

  // 「3」まで送ったら、残りは送らずに止めておく（止まった印は「4」の上に残る）
  release();
  await until(() => provider.prompts.length === 3 && !runner.isBusy(chatId) && runner.live(chatId).queue.paused);
  assert.deepEqual(provider.prompts, ["1", "2", "3"]);
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => m.text), ["4", "5"]);
  assert.deepEqual(runner.live(chatId).queue.stops, [0, 1]);

  // 自動で送るに戻すと、止まった印を越えて次の印（「4」のあと）まで送って、また止める
  await call("PUT", `/api/chats/${chatId}/queue/paused`, { paused: false });
  await until(() => provider.prompts.length === 4 && !runner.isBusy(chatId) && runner.live(chatId).queue.paused);
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => m.text), ["5"]);
  assert.deepEqual(runner.live(chatId).queue.stops, [0]);

  // × で外す（位置の置き換え）
  assert.deepEqual((await call("PUT", `/api/chats/${chatId}/queue/stops`, { stops: [] })).body.stops, []);
});

test("待ちの列の API: すべて消す・まとめて送る（文は空行でつなぎ、添付も合わせる。作業中なら止めずに伝える）", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  // 送るものがなければ 409（状態による失敗）
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/send-all`)).status, 409);
  // すべて消す
  await call("POST", `/api/chats/${chatId}/queue`, { text: "消す" });
  assert.deepEqual((await call("DELETE", `/api/chats/${chatId}/queue`)).body, { messages: [], paused: false, stops: [], waiting_edit: false });
  assert.deepEqual((await call("DELETE", `/api/chats/${chatId}/queue`)).body.messages, []);
  await call("POST", `/api/chats/${chatId}/queue`, { text: "A" });
  await call("POST", `/api/chats/${chatId}/queue`, { text: "B" });
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/queue/send-all`)).body.messages, []);
  assert.deepEqual(provider.told, ["A\n\nB"]);
  assert.deepEqual(runner.live(chatId).queue.messages, []);
  release();
  await until(() => !runner.isBusy(chatId));
});

test("待ちの列の API: 選んだものだけ、まとめて送る・消す・いちばん上か下へ移す（ほかは並びを保つ）", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  const ids: string[] = [];
  for (const text of ["A", "B", "C", "D", "E"]) ids.push((await call("POST", `/api/chats/${chatId}/queue`, { text })).body.id);
  const texts = () => runner.live(chatId).queue.messages.map((m) => m.text);
  // B と D をいちばん上へ、C をいちばん下へ
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[3], ids[1]], to: "top" })).status, 200);
  assert.deepEqual(texts(), ["B", "D", "A", "C", "E"]);
  await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[2]], to: "bottom" });
  assert.deepEqual(texts(), ["B", "D", "A", "E", "C"]);
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[0]], to: "middle" })).status, 400);
  // ドラッグで落とした位置へまとめて移す: B と A を E の前へ（並びは列の順のまま）、null ならいちばん下
  await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[0], ids[1]], before: ids[4] });
  assert.deepEqual(texts(), ["D", "B", "A", "E", "C"]);
  await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[3]], before: null });
  assert.deepEqual(texts(), ["B", "A", "E", "C", "D"]);
  await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[3], ids[2]], before: ids[1] });
  assert.deepEqual(texts(), ["C", "D", "B", "A", "E"]);
  // to と before の両方・どちらもなしは 400
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[0]], to: "top", before: null })).status, 400);
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[0]] })).status, 400);
  // 元の並び（B D A E C）に戻す
  await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[2]], to: "bottom" });
  await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[1]], to: "top" });
  assert.deepEqual(texts(), ["B", "D", "A", "E", "C"]);
  // 止める線のある位置へ落とす: below_stop: false なら線の上（B D | A E C の C を A の前・線の上へ → B D C | A E）。ほかの指示は線の同じ側に残る
  await call("PUT", `/api/chats/${chatId}/queue/stops`, { stops: [2] });
  await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[2]], before: ids[0], below_stop: false });
  assert.deepEqual(texts(), ["B", "D", "C", "A", "E"]);
  assert.deepEqual(runner.live(chatId).queue.stops, [3]);
  // いちばん上へ移しても、線の上の B・D は線の上のまま（E が線を越えて上へ）
  await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[4]], to: "top" });
  assert.deepEqual(texts(), ["E", "B", "D", "C", "A"]);
  assert.deepEqual(runner.live(chatId).queue.stops, [4]);
  // 元に戻す（線を外し、B D A E C に）
  await call("PUT", `/api/chats/${chatId}/queue/stops`, { stops: [] });
  for (const i of [1, 3, 0, 4, 2]) await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[i]], to: "bottom" });
  assert.deepEqual(texts(), ["B", "D", "A", "E", "C"]);
  // A と E を消す
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/queue/remove-many`, { ids: [ids[0], ids[4], "nai"] })).body.messages.map((m: { text: string }) => m.text), ["B", "D", "C"]);
  assert.deepEqual(texts(), ["B", "D", "C"]);
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/remove-many`, { ids: [] })).status, 400);
  // C と B だけをまとめて送る（列の順につなぐ）。D は残る
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/queue/send-all`, { ids: [ids[2], ids[1]] })).body.messages.map((m: { text: string }) => m.text), ["D"]);
  assert.deepEqual(provider.told, ["B\n\nC"]);
  assert.deepEqual(texts(), ["D"]);
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/send-all`, { ids: ["nai"] })).status, 404);
  // 残った D が止めたあとに送られないよう、列を空にしてから止める
  await call("DELETE", `/api/chats/${chatId}/queue`);
  runner.cancel(chatId);
  await until(() => !runner.isBusy(chatId));
  release();
});

test("質問として送る（pause_after）: その指示の作業が終わったら送信待ちを自動で送らずに一時停止する。来なければ印は外れる", async () => {
  const { call, project, runner, provider } = setup();
  let release = provider.hold();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);

  // あとで（送信待ちに入れる）: 入れたその指示のすぐあとに印を付ける
  await call("POST", `/api/chats/${chatId}/queue`, { text: "2" });
  const asked = (await call("POST", `/api/chats/${chatId}/queue`, { text: "質問?", pause_after: true })).body;
  assert.deepEqual(asked.stops, [2]);
  await call("POST", `/api/chats/${chatId}/queue`, { text: "4" });
  release();
  // 「質問?」まで送ったら、残りは送らずに止めておく
  await until(() => provider.prompts.length === 3 && !runner.isBusy(chatId) && runner.live(chatId).queue.paused);
  assert.deepEqual(provider.prompts.slice(1), ["2", "質問?"]);
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => m.text), ["4"]);
  await call("DELETE", `/api/chats/${chatId}/queue`);

  // いま（作業中に伝える）: いまの作業が終わったら、そのあいだに来た指示の前で止める
  release = provider.hold();
  await call("POST", `/api/chats/${chatId}/messages`, { text: "5" });
  await until(() => provider.prompts.length === 4);
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/tell`, { text: "これは?", pause_after: true })).body, { result: "told" });
  assert.deepEqual(runner.live(chatId).queue.stops, [0]);
  await call("POST", `/api/chats/${chatId}/queue`, { text: "6" });
  release();
  await until(() => !runner.isBusy(chatId) && runner.live(chatId).queue.paused);
  assert.equal(provider.prompts.length, 4);
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => m.text), ["6"]);
  await call("DELETE", `/api/chats/${chatId}/queue`);

  // すぐ送る（作業していない）: その作業のあいだに何も来なければ、終わったときに印を外す（あとで送った作業では止めない）
  release = provider.hold();
  await call("POST", `/api/chats/${chatId}/messages`, { text: "どう?", pause_after: true });
  await until(() => provider.prompts.length === 5);
  assert.deepEqual(runner.live(chatId).queue.stops, [0]);
  release();
  await until(() => !runner.isBusy(chatId));
  assert.deepEqual(runner.live(chatId).queue, { messages: [], paused: false, stops: [], waiting_edit: false });
  // 作業していないときの /queue でも同じ（すぐ送って、その作業の終わりで止める）
  release = provider.hold();
  assert.equal((await call("POST", `/api/chats/${chatId}/queue`, { text: "なぜ?", pause_after: true })).body.queued, false);
  await until(() => provider.prompts.length === 6);
  assert.deepEqual(runner.live(chatId).queue.stops, [0]);
  await call("POST", `/api/chats/${chatId}/queue`, { text: "7" });
  release();
  await until(() => !runner.isBusy(chatId) && runner.live(chatId).queue.paused);
  assert.equal(provider.prompts.length, 6);
});

test("送信待ちの圧縮の行（POST /queue/compact）: いちばん下・指示のすぐあとに足す。書き直せず、まとめない。すぐ送ると圧縮する", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  const two = (await call("POST", `/api/chats/${chatId}/queue`, { text: "2" })).body.id as string;
  await call("POST", `/api/chats/${chatId}/queue`, { text: "3" });
  const labels = (body: { messages: { text: string; compact?: boolean }[] }) => body.messages.map((m) => (m.compact ? "圧縮" : m.text));
  assert.deepEqual(labels((await call("POST", `/api/chats/${chatId}/queue/compact`, {})).body), ["2", "3", "圧縮"]);
  // 2 のすぐあと（2 のあとの一時停止の線より上）
  await call("PUT", `/api/chats/${chatId}/queue/stop-after`, { id: two });
  const after = (await call("POST", `/api/chats/${chatId}/queue/compact`, { after: two })).body;
  assert.deepEqual(labels(after), ["2", "圧縮", "3", "圧縮"]);
  assert.deepEqual(after.stops, [2]);
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/compact`, { after: "nope" })).status, 404);
  const compactId = after.messages[1].id as string;
  // 書き直せない。まとめるときは圧縮の行を数えず、列に残す
  assert.equal((await call("PATCH", `/api/chats/${chatId}/queue/${compactId}`, { text: "x" })).status, 400);
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/merge`, { ids: [two, compactId] })).status, 400);
  const ids = after.messages.map((m: { id: string }) => m.id) as string[];
  const merged = (await call("POST", `/api/chats/${chatId}/queue/merge`, { ids })).body;
  assert.deepEqual(labels(merged), ["2\n\n3", "圧縮", "圧縮"]);
  // 止めているときに、作業中の圧縮の行を「すぐ送る」と、いちばん上へ移る（いまのやり取りが終わったらすぐ圧縮する）。
  // 止めるのは 1 件目の上の線に置き換わり、圧縮だけは送ってから止まる
  await call("PUT", `/api/chats/${chatId}/queue/stops`, { stops: [] });
  await call("PUT", `/api/chats/${chatId}/queue/paused`, { paused: true });
  const moved = (await call("POST", `/api/chats/${chatId}/queue/${merged.messages[2].id}/send`)).body;
  assert.deepEqual(labels(moved), ["圧縮", "2\n\n3", "圧縮"]);
  assert.equal(moved.paused, false);
  assert.deepEqual(moved.stops, [1]);
  release();
  await until(() => provider.prompts.length === 2 && !runner.isBusy(chatId));
  assert.equal(provider.prompts[1], "/compact");
  // 作業していないときに「すぐ送る」と、すぐ圧縮する
  const rest = (await call("GET", `/api/chats/${chatId}`)).body.live.queue;
  assert.equal(rest.paused, true);
  await call("POST", `/api/chats/${chatId}/queue/${rest.messages[1].id}/send`);
  await until(() => provider.prompts.length === 3 && !runner.isBusy(chatId));
  assert.equal(provider.prompts[2], "/compact");
  assert.deepEqual(labels((await call("GET", `/api/chats/${chatId}`)).body.live.queue), ["2\n\n3"]);
});

test("送信待ちのコンテキスト消去の行（POST /queue/clear）: 足して、書き直せず、作業していないときにすぐ送ると消去して記録に残す", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  const two = (await call("POST", `/api/chats/${chatId}/queue`, { text: "2" })).body.id as string;
  const labels = (body: { messages: { text: string; clear?: boolean }[] }) => body.messages.map((m) => (m.clear ? "消去" : m.text));
  const added = (await call("POST", `/api/chats/${chatId}/queue/clear`, { after: two })).body;
  assert.deepEqual(labels(added), ["2", "消去"]);
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/clear`, { after: "nope" })).status, 404);
  const clearId = added.messages[1].id as string;
  assert.equal((await call("PATCH", `/api/chats/${chatId}/queue/${clearId}`, { text: "x" })).status, 400);
  // 止めておいて作業を終え、消去の行だけを「すぐ送る」
  await call("PUT", `/api/chats/${chatId}/queue/paused`, { paused: true });
  release();
  await until(() => !runner.isBusy(chatId));
  assert.ok((await call("GET", `/api/chats/${chatId}`)).body.chat.session_id);
  const sent = (await call("POST", `/api/chats/${chatId}/queue/${clearId}/send`)).body;
  assert.deepEqual(labels(sent), ["2"]);
  const detail = (await call("GET", `/api/chats/${chatId}`)).body;
  assert.equal(detail.chat.session_id, null);
  assert.equal(detail.events.at(-1).type, "context_cleared");
  // 会話がないので、もう一度足して「すぐ送る」と 409
  const again = (await call("POST", `/api/chats/${chatId}/queue/clear`, {})).body.messages[1].id as string;
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/${again}/send`)).status, 409);
});
