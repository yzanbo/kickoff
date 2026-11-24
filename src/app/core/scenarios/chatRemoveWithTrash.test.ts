// 機能をまたぐ筋書き: チャットの削除・アーカイブ（chat）× 子チャット（childChats）× ゴミ箱（trash）× 会話記録・添付の片付け（ai・attachments）。
// チャットの AI がチャットをアーカイブする・消す（archive_chat・delete_chat の中身 ChatRemover）: 同じプロジェクトのチャットを子孫ごと・
// 作業中のものがあれば断る・自分（自分の祖先）は作業の終わりに行う予約（送信待ちは止める）。画面からの削除はゴミ箱に入り、3 日たって本当に消すとき片付ける
import assert from "node:assert/strict";
import { test } from "vitest";
import { TRASH_KEEP_MS } from "@shared/trash/types";
import { setup, until } from "@/app/core/testing/testServer";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { isBusy, liveOf, noticesOf, sendAndWait, untilIdle } from "@/features/chat/core/testing";

type Ctx = ReturnType<typeof setup>;

/** 動かして終わったチャット（parentId を渡せば、その子チャット） */
const doneChat = (ctx: Ctx, text: string, parentId?: number) => sendAndWait(ctx, { projectId: ctx.project.id, text, parentChatId: parentId });

test("archive_chat: 同じプロジェクトのほかの家系のチャットを子チャットごとアーカイブする。もうアーカイブ済み・ほかのプロジェクト・ないチャットは変えない", async () => {
  const ctx = setup();
  const { store, chatRemover } = ctx;
  const me = await doneChat(ctx, "わたし");
  const target = await doneChat(ctx, "片付ける");
  const child = await doneChat(ctx, "子", target);
  const text = chatRemover.fromChat(me, "archive", target);
  assert.match(text, /チャット「.*」（ID \d+）（子チャットなど 1 件も一緒に）をアーカイブしました/);
  assert.notEqual(store.chats.get(target)?.archived_at, null);
  assert.notEqual(store.chats.get(child)?.archived_at, null);
  assert.equal(store.chats.get(me)?.archived_at, null);
  assert.match(chatRemover.fromChat(me, "archive", target), /もうアーカイブしてあります/);
  // ほかのプロジェクトのチャット・ないチャットは断る
  const other = store.projects.create({ name: "o", repo_path: tempDir(), provider: "claude" });
  const foreign = store.chats.create({ ...store.chats.get(me)!, project_id: other.id, title: "よそ", parent_chat_id: null, group_id: null, worktree_path: null, parent_event_id: null, note_path: null });
  assert.throws(() => chatRemover.fromChat(me, "archive", foreign.id), /このプロジェクトにありません/);
  assert.throws(() => chatRemover.fromChat(me, "delete", 99999), /このプロジェクトにありません/);
  assert.equal(store.chats.get(foreign.id)?.archived_at, null);
});

test("delete_chat: 子チャットごと Kickoff のゴミ箱に入れ（消したチャットを覚える）、戻せる。作業中のチャットが含まれていれば待たずに断る", async () => {
  const ctx = setup();
  const { api, project, store, provider, chatRemover } = ctx;
  const me = await doneChat(ctx, "わたし");
  const target = await doneChat(ctx, "消す");
  const child = await doneChat(ctx, "子", target);
  // 子が作業中なら断る（親を消すと子も消えるため）
  const release = provider.hold();
  await api("POST /api/chats/:chatId/messages", { params: { chatId: child }, body: { text: "まだ作業中" } });
  await until(() => isBusy(ctx, child));
  assert.throws(() => chatRemover.fromChat(me, "delete", target), /作業中のチャット（「.*」）が含まれているので削除できません/);
  assert.ok(store.chats.get(target));
  release();
  await untilIdle(ctx, child);
  assert.match(chatRemover.fromChat(me, "delete", target), /（子チャットなど 1 件も一緒に）を Kickoff のゴミ箱に入れました。3 日間/);
  assert.equal(store.chats.get(target), undefined);
  assert.equal(store.chats.get(child), undefined);
  const [item] = (await api("GET /api/projects/:projectId/trash", { params: { projectId: project.id } })).body;
  assert.equal(item.kind, "chat");
  assert.equal(item.by_chat_id, me);
  assert.equal((await api("POST /api/trash/:itemId/restore", { params: { itemId: item.id }, body: {} })).status, 200);
  assert.ok(store.chats.get(target));
  assert.ok(store.chats.get(child));
});

test("自分のアーカイブ: 作業中は予約だけして、作業が終わったらアーカイブし、送信待ちは止めてお知らせを残す", async () => {
  const ctx = setup();
  const { call, api, store, provider, chatRemover } = ctx;
  const me = await doneChat(ctx, "わたし");
  const release = provider.hold();
  await api("POST /api/chats/:chatId/messages", { params: { chatId: me }, body: { text: "片付けて" } });
  await until(() => isBusy(ctx, me));
  const text = chatRemover.fromChat(me, "archive", me);
  assert.match(text, /予約しました。このチャットの作業が終わったら、Kickoff がチャット「.*」（ID \d+）をアーカイブします/);
  assert.equal((await call("POST", `/api/chats/${me}/messages`, { text: "次の指示", when: "later" })).body.result, "queued");
  assert.equal(store.chats.get(me)?.archived_at, null, "作業中はまだしまわない");
  release();
  await until(() => store.chats.get(me)?.archived_at !== null);
  assert.match((await noticesOf(ctx, me)).at(-1) ?? "", /^予約どおり、チャット「.*」（ID \d+）をアーカイブしました/);
  const { queue } = await liveOf(ctx, me);
  assert.equal(queue.paused, true);
  assert.equal(queue.messages.length, 1);
  assert.equal(await isBusy(ctx, me), false);
});

test("祖先の削除: 子チャットから親を頼まれたら、子の作業が終わってから子孫ごとゴミ箱に入れる", async () => {
  const ctx = setup();
  const { api, store, provider, chatRemover } = ctx;
  const parent = await doneChat(ctx, "親");
  const child = await doneChat(ctx, "子", parent);
  const release = provider.hold();
  await api("POST /api/chats/:chatId/messages", { params: { chatId: child }, body: { text: "親ごと消して" } });
  await until(() => isBusy(ctx, child));
  assert.match(chatRemover.fromChat(child, "delete", parent), /予約しました。.*（子チャットなど 1 件も一緒に）を削除します/);
  assert.ok(store.chats.get(parent));
  release();
  await until(() => store.chats.get(parent) === undefined);
  assert.equal(store.chats.get(child), undefined);
});

test("チャットを削除するとゴミ箱に入り（会話記録はまだ消さない）、3 日たって本当に消すとき、残ったチャットが使っていない会話記録を消すよう頼む（分岐したチャットが写した元のセッションは残す）", async () => {
  const ctx = setup();
  const { api, project, store, provider, trashBin, trashClock } = ctx;
  const chatId = await doneChat(ctx, "1");
  const result = store.events.list(chatId).find((e) => e.type === "result")!;
  const forkedId = (await api("POST /api/chats/:chatId/fork", { params: { chatId: chatId }, body: { event_id: result.id } })).body.id;
  const removed = await api("DELETE /api/chats/:chatId", { params: { chatId: forkedId } });
  assert.equal(removed.status, 200);
  assert.equal(store.chats.get(forkedId), undefined);
  assert.equal(store.trash.get(removed.body.trash_id)?.kind, "chat");
  assert.equal(provider.discarded.length, 0);
  // 3 日たつと本当に消える。分岐したチャットは元の記録（s1）を写して持つので、消すのは自分のセッションだけ
  trashClock.now += TRASH_KEEP_MS + 60_000;
  await trashBin.sweep();
  assert.equal(provider.discarded.length, 1);
  assert.deepEqual(provider.discarded[0], { sessionIds: ["fork-1"], cwds: [project.repo_path] });
  // 元のチャットも消すと、もう誰も使っていない s1 も
  await api("DELETE /api/chats/:chatId", { params: { chatId: chatId } });
  trashClock.now += TRASH_KEEP_MS + 60_000;
  await trashBin.sweep();
  assert.deepEqual(provider.discarded[1].sessionIds, ["s1"]);
});

test("チャットのゴミ箱: 子チャットごと戻せ、戻したら一覧に戻る。親がもう消えていれば親のないチャットとして戻す。本当に消すとき、ほかで使っていない添付も消す", async () => {
  const { api, project, store, trashBin, trashClock, uploads } = setup();
  const parent = store.chats.create({ project_id: project.id, provider: "claude", title: "親", status: "completed" });
  const child = store.chats.create({ project_id: project.id, provider: "claude", title: "子", status: "completed", parent_chat_id: parent.id });
  const kept = await uploads.save({ name: "a.png", type: "image/png", bytes: new Uint8Array([1]) });
  const shared = await uploads.save({ name: "b.png", type: "image/png", bytes: new Uint8Array([2]) });
  store.events.add(child.id, { type: "user", text: "見て", message_uuid: "m1", attachments: [kept, shared] });
  const other = store.chats.create({ project_id: project.id, provider: "claude", title: "別", status: "completed" });
  store.events.add(other.id, { type: "user", text: "同じ画像", message_uuid: "m2", attachments: [shared] });

  // 子だけ消して戻す → 子として戻る
  const childItem = (await api("DELETE /api/chats/:chatId", { params: { chatId: child.id } })).body.trash_id as string;
  assert.equal(store.chats.get(child.id), undefined);
  assert.deepEqual(store.chats.descendants(parent.id), []);
  await api("POST /api/trash/:itemId/restore", { params: { itemId: childItem }, body: {} });
  assert.equal(store.chats.get(child.id)?.parent_chat_id, parent.id);

  // 親を消すと子も一緒に入り、戻すと一緒に戻る
  const parentItem = (await api("DELETE /api/chats/:chatId", { params: { chatId: parent.id } })).body.trash_id as string;
  assert.equal(store.chats.get(child.id), undefined);
  assert.deepEqual(
    (await api("GET /api/projects/:projectId/trash", { params: { projectId: project.id } })).body.map((i: { label: string }) => i.label),
    ["親"],
  );
  await api("POST /api/trash/:itemId/restore", { params: { itemId: parentItem }, body: {} });
  assert.equal(store.chats.get(child.id)?.parent_chat_id, parent.id);

  // 本当に消すと、ほかのチャットが使っていない添付だけ消える
  await api("DELETE /api/chats/:chatId", { params: { chatId: parent.id } });
  trashClock.now += TRASH_KEEP_MS + 60_000;
  await trashBin.sweep();
  assert.equal(await uploads.resolve(kept.id), undefined);
  assert.ok(await uploads.resolve(shared.id));
  assert.equal(store.trash.list(project.id).length, 0);
});

test("AI 切り替え用の長文ファイルはアーカイブ・ゴミ箱で保持し、チャットの完全削除後に片付ける", async () => {
  const { api, project, store, trashBin, trashClock, uploads } = setup();
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "切り替え", status: "completed" });
  const file = await uploads.save({ name: "long.txt", type: "text/plain", bytes: new TextEncoder().encode("長い会話") });
  store.events.add(chat.id, { type: "provider_switched", from: "claude", to: "codex", handoff_attachments: [file] });
  assert.equal(store.events.uploadsInUse([file.id]).has(file.id), true);
  await api("PATCH /api/chats/:chatId", { params: { chatId: chat.id }, body: { archived: true } });
  assert.ok(await uploads.resolve(file.id));
  const removed = await api("DELETE /api/chats/:chatId", { params: { chatId: chat.id } });
  assert.equal(removed.status, 200);
  assert.ok(await uploads.resolve(file.id));
  trashClock.now += TRASH_KEEP_MS + 60_000;
  await trashBin.sweep();
  assert.equal(await uploads.resolve(file.id), undefined);
});
