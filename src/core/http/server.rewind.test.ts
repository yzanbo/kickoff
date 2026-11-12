// API のテスト: 分岐・巻き戻し・ファイルを戻す（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { setup, until } from "../testing/testServer.js";

test("分岐の API: 作業の終わりの時点までの会話を新しいチャットに写す（元のチャットは変えない）", async () => {
  const { call, project, store, runner, provider } = setup();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => store.chats.get(chatId)?.status === "completed");
  await call("POST", `/api/chats/${chatId}/messages`, { text: "2" });
  await until(() => !runner.isBusy(chatId) && store.events.list(chatId).filter((e) => e.type === "result").length === 2);
  const events = store.events.list(chatId);
  const first = events.find((e) => e.type === "result")!;
  assert.deepEqual([(first.data as { session_id?: string }).session_id, (first.data as { message_id?: string }).message_id], ["s1", "m1"]);

  const forked = await call("POST", `/api/chats/${chatId}/fork`, { event_id: first.id });
  assert.equal(forked.status, 201);
  assert.equal(forked.body.title, `${store.chats.get(chatId)!.title}（分岐）`);
  assert.equal(forked.body.session_id, "fork-1");
  assert.deepEqual(provider.forks, [["s1", "m1", project.repo_path]]);
  // 写した記録は時刻もそのまま、最後に分岐した知らせ
  const copied = store.events.list(forked.body.id);
  assert.deepEqual(copied.map((e) => e.type), ["user", "result", "notice"]);
  assert.equal(copied[0].created_at, events[0].created_at);
  assert.equal(store.events.list(chatId).length, events.length);

  // 分岐できない時点・見つからないチャット
  const user = events.find((e) => e.type === "user")!;
  assert.deepEqual(await call("POST", `/api/chats/${chatId}/fork`, { event_id: user.id }), { status: 400, body: { error: "この時点からは分岐できません" } });
  assert.equal((await call("POST", "/api/chats/999/fork", { event_id: first.id })).status, 404);
  // 作業中は分岐できない
  const release = provider.hold();
  await call("POST", `/api/chats/${chatId}/messages`, { text: "3" });
  assert.equal((await call("POST", `/api/chats/${chatId}/fork`, { event_id: first.id })).status, 409);
  release();
  await until(() => !runner.isBusy(chatId));
});

test("巻き戻し・分岐は、止めた作業の終わりを起点にしない（その時点のメッセージはセッションに残らないことがある）", async () => {
  const { call, project, store, provider } = setup();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => store.chats.get(chatId)?.status === "completed");
  const completed = store.events.list(chatId).find((e) => e.type === "result")!;
  // 以前の記録の形: 止めた作業の終わりにも message_id が付いている
  store.events.add(chatId, { type: "user", text: "2" , message_uuid: "u1" });
  const cancelled = store.events.add(chatId, { type: "result", status: "cancelled", session_id: "s9", message_id: "m9" });
  const third = store.events.add(chatId, { type: "user", text: "3" , message_uuid: "u2" });
  assert.equal((await call("POST", `/api/chats/${chatId}/fork`, { event_id: cancelled.id })).status, 400);
  assert.equal((await call("POST", `/api/chats/${chatId}/rewind`, { event_id: third.id, text: "3 を書き直し" })).status, 200);
  const data = completed.data as { session_id: string; message_id: string };
  assert.deepEqual(provider.forks.at(-1), [data.session_id, data.message_id, project.repo_path]);
});

test("巻き戻しの API: 自分の発言の手前まで戻し、書き直した文で送り直す（添付は引き継ぐ）", async () => {
  const { call, project, store, runner, provider } = setup();
  const attachment = { kind: "file", id: randomUUID(), name: "a.txt", mime: "text/plain", size: 1 };
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => store.chats.get(chatId)?.status === "completed");
  await call("POST", `/api/chats/${chatId}/messages`, { text: "2", attachments: [attachment] });
  await until(() => !runner.isBusy(chatId) && store.events.list(chatId).filter((e) => e.type === "result").length === 2);
  const before = store.events.list(chatId);
  const [firstUser, secondUser] = before.filter((e) => e.type === "user");
  const firstResult = before.find((e) => e.type === "result")!;

  // 2 回目の発言を巻き戻す: 1 回目の終わりの時点から分岐し、その後ろの記録を消して、書き直した文を送る
  const rewound = await call("POST", `/api/chats/${chatId}/rewind`, { event_id: secondUser.id, text: "2 を書き直し", options: { model: "m-x" } });
  assert.equal(rewound.status, 200);
  assert.equal(rewound.body.id, chatId);
  assert.equal(rewound.body.model, "m-x");
  assert.deepEqual(provider.forks, [["s1", "m1", project.repo_path]]);
  await until(() => !runner.isBusy(chatId) && provider.prompts.length === 3);
  assert.equal(provider.resumes[2], "fork-1");
  const after = store.events.list(chatId);
  assert.deepEqual(after.map((e) => e.type), ["user", "result", "notice", "user", "result"]);
  assert.deepEqual(after.slice(0, 2), before.slice(0, 2));
  assert.ok(after[2].id > firstResult.id && after[3].id > secondUser.id);
  const { message_uuid, ...rewrittenData } = after[3].data as { message_uuid?: string };
  assert.deepEqual(rewrittenData, { text: "2 を書き直し", attachments: [attachment] });
  // 発言には Claude Code に渡した ID を残す（ファイルを戻すときの目印）
  assert.equal(message_uuid, provider.promptIds[2]);
  // 消した発言は全文検索にも残らない
  assert.deepEqual(store.events.search("書き直し", { chatId }).map((h) => h.event_id), [after[3].id]);
  assert.deepEqual(store.events.search("2", { chatId }).map((h) => h.event_id), [after[3].id]);

  // 最初の発言を巻き戻す: 分岐せず、セッションを空にして最初から
  const forks = provider.forks.length;
  const resent = await call("POST", `/api/chats/${chatId}/rewind`, { event_id: firstUser.id, text: "やり直し" });
  assert.equal(resent.status, 200);
  assert.equal(resent.body.session_id, null);
  await until(() => !runner.isBusy(chatId) && provider.prompts.length === 4);
  assert.equal(provider.forks.length, forks);
  assert.equal(provider.resumes[3], null);
  assert.equal(provider.prompts[3], "やり直し");
  assert.deepEqual(store.events.list(chatId).map((e) => e.type), ["notice", "user", "result"]);

  // 自分の発言でない・ほかのチャットのイベント・見つからないチャットは断る
  const events = store.events.list(chatId);
  const result = events.find((e) => e.type === "result")!;
  const user = events.find((e) => e.type === "user")!;
  const notMine = await call("POST", `/api/chats/${chatId}/rewind`, { event_id: result.id, text: "x" });
  assert.deepEqual(notMine, { status: 400, body: { error: "自分の発言のところからだけ巻き戻せます" } });
  const otherId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "別" })).body.id;
  await until(() => !runner.isBusy(otherId));
  const otherUser = store.events.list(otherId).find((e) => e.type === "user")!;
  assert.equal((await call("POST", `/api/chats/${chatId}/rewind`, { event_id: otherUser.id, text: "x" })).status, 400);
  assert.equal((await call("POST", `/api/chats/${chatId}/rewind`, { text: "x" })).status, 400);
  assert.equal((await call("POST", "/api/chats/999/rewind", { event_id: user.id, text: "x" })).status, 404);
  // 文も添付もなければ送れない
  assert.equal((await call("POST", `/api/chats/${chatId}/rewind`, { event_id: user.id, text: "  " })).status, 400);

  // 作業中は断り、記録も待ちの列も変えない
  const release = provider.hold();
  await call("POST", `/api/chats/${chatId}/messages`, { text: "3" });
  await call("POST", `/api/chats/${chatId}/queue`, { text: "待ち" });
  const busyEvents = store.events.list(chatId).length;
  assert.equal((await call("POST", `/api/chats/${chatId}/rewind`, { event_id: user.id, text: "x" })).status, 409);
  assert.equal(store.events.list(chatId).length, busyEvents);
  assert.equal(runner.live(chatId).queue.messages.length, 1);
  release();
  await until(() => !runner.isBusy(chatId) && runner.live(chatId).queue.messages.length === 0);
  // ほかのチャットの記録は変わらない
  assert.deepEqual(store.events.list(otherId).map((e) => e.type), ["user", "result"]);
});

test("ファイルを戻す API: 自分の発言を送る前の状態にファイルだけ戻す（会話はそのまま）。dry_run は量だけ。戻せない・作業中は断る", async () => {
  const { call, project, store, runner, provider } = setup();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => store.chats.get(chatId)?.status === "completed");
  const [user] = store.events.list(chatId).filter((e) => e.type === "user");
  const messageId = user.type === "user" ? user.data.message_uuid : "";
  assert.equal(messageId, provider.promptIds[0]);

  // 量だけを見る（戻さない・お知らせも残さない）
  const dry = await call("POST", `/api/chats/${chatId}/rewind-files`, { event_id: user.id, dry_run: true });
  assert.deepEqual(dry.body, provider.rewindResult);
  assert.deepEqual(provider.rewinds, [["s1", messageId, project.repo_path, true]]);
  const events = store.events.list(chatId).length;
  // 戻す: お知らせを残し、会話の記録は消さない
  assert.equal((await call("POST", `/api/chats/${chatId}/rewind-files`, { event_id: user.id })).status, 200);
  // 本当に戻したときの結果には変わったファイルが付かないので、先に量を測ってから戻す
  assert.deepEqual(provider.rewinds.slice(1).map((r) => r[3]), [true, false]);
  const after = store.events.list(chatId);
  assert.equal(after.length, events + 1);
  assert.match(JSON.stringify(after.at(-1)!.data), /2 個のファイル: a\.ts、b\.ts/);

  // 戻せない（Claude Code が断った）・作業中
  provider.rewindResult = { can_rewind: false, error: "No file checkpoint found" };
  assert.equal((await call("POST", `/api/chats/${chatId}/rewind-files`, { event_id: user.id, dry_run: true })).status, 400);
  provider.rewindResult = { can_rewind: true, files_changed: [] };
  const release = provider.hold();
  await call("POST", `/api/chats/${chatId}/messages`, { text: "2" });
  await until(() => runner.isBusy(chatId));
  assert.equal((await call("POST", `/api/chats/${chatId}/rewind-files`, { event_id: user.id })).status, 409);
  release();
  await until(() => !runner.isBusy(chatId));
});

test("巻き戻しの API: restore_files なら、分岐する前にファイルも戻す（ファイルの記録は元のセッションにあるため）", async () => {
  const { call, project, store, runner, provider } = setup();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => store.chats.get(chatId)?.status === "completed");
  await call("POST", `/api/chats/${chatId}/messages`, { text: "2" });
  await until(() => !runner.isBusy(chatId) && store.events.list(chatId).filter((e) => e.type === "result").length === 2);
  const second = store.events.list(chatId).filter((e) => e.type === "user")[1];
  const messageId = (second.data as { message_uuid: string }).message_uuid;
  assert.equal((await call("POST", `/api/chats/${chatId}/rewind`, { event_id: second.id, text: "2'", restore_files: true })).status, 200);
  // 元のセッション（s1）で（量を測って）戻してから、分岐する
  assert.deepEqual(provider.rewinds, [
    ["s1", messageId, project.repo_path, true],
    ["s1", messageId, project.repo_path, false],
  ]);
  assert.equal(provider.forks.length, 1);
  await until(() => !runner.isBusy(chatId) && provider.prompts.length === 3);
  assert.ok(store.events.list(chatId).some((e) => e.type === "notice" && /ファイルもこの発言を送る前の状態に戻しました/.test(JSON.stringify(e.data))));
  // 戻せなければ、何も消さずに 400
  provider.rewindResult = { can_rewind: false };
  const count = store.events.list(chatId).length;
  const third = store.events.list(chatId).filter((e) => e.type === "user")[1];
  assert.equal((await call("POST", `/api/chats/${chatId}/rewind`, { event_id: third.id, text: "x", restore_files: true })).status, 400);
  assert.equal(store.events.list(chatId).length, count);
});

test("巻き戻しの API: 分岐に対応していないプロバイダーなら 400（最初の発言なら分岐しないので送れる）", async () => {
  const { call, project, store, runner, provider } = setup();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => !runner.isBusy(chatId));
  await call("POST", `/api/chats/${chatId}/messages`, { text: "2" });
  await until(() => !runner.isBusy(chatId) && store.events.list(chatId).filter((e) => e.type === "result").length === 2);
  const [firstUser, secondUser] = store.events.list(chatId).filter((e) => e.type === "user");
  Object.assign(provider, { fork: undefined });
  const res = await call("POST", `/api/chats/${chatId}/rewind`, { event_id: secondUser.id, text: "x" });
  assert.deepEqual(res, { status: 400, body: { error: "Fake は巻き戻しに対応していません" } });
  assert.equal(store.events.list(chatId).length, 4);
  assert.equal((await call("POST", `/api/chats/${chatId}/rewind`, { event_id: firstUser.id, text: "y" })).status, 200);
  await until(() => !runner.isBusy(chatId));
});
