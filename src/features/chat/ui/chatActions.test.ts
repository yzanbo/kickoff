import assert from "node:assert/strict";
import { onTestFinished, test, vi } from "vitest";
import { makeChat } from "@shared/foundation/testing/factories";
import { api } from "@/foundation/ui/api";
import { setAskHost, type AskRequest } from "@/foundation/ui/kit/ask";
import { installMemoryStorage } from "@/foundation/ui/storage/memoryStorage";
import { confirmArchiveChats, confirmDeleteChats } from "./chatActions";

installMemoryStorage();

// 偽の api（busy の ID は作業中として断る）
const fake = { busy: new Set<number>(), archived: [] as number[], deleted: [] as number[] };

/** ダイアログをすべて「実行」で答え、出た依頼を順に覚える */
function answerAll(): AskRequest[] {
  const asked: AskRequest[] = [];
  setAskHost((req) => {
    asked.push(req);
    if (req.kind === "confirm") req.resolve(true, []);
  });
  fake.busy.clear();
  fake.archived = [];
  fake.deleted = [];
  const archive = vi.spyOn(api, "archiveChat").mockImplementation(async (id) => {
    if (fake.busy.has(id)) throw new Error("作業中です");
    fake.archived.push(id);
    return makeChat(id);
  });
  const remove = vi.spyOn(api, "deleteChat").mockImplementation(async (id) => {
    if (fake.busy.has(id)) throw new Error("作業中です");
    fake.deleted.push(id);
    return { trash_id: String(id) };
  });
  // まとめて消したときの知らせの時計を残さない
  vi.useFakeTimers();
  onTestFinished(() => {
    setAskHost(undefined);
    archive.mockRestore();
    remove.mockRestore();
    vi.useRealTimers();
  });
  return asked;
}

test("1 件なら確かめの文に名前が入る（直に渡しても配列でも）", async () => {
  const asked = answerAll();
  const chat = makeChat(1, { title: "調べもの", archived_at: null });
  assert.equal(await confirmArchiveChats(chat), true);
  assert.equal(await confirmArchiveChats([chat]), true);
  assert.equal(await confirmDeleteChats([chat]), true);
  assert.deepEqual(
    asked.map((r) => r.kind === "confirm" && r.title),
    ["チャット「調べもの」をアーカイブしますか？", "チャット「調べもの」をアーカイブしますか？", "チャット「調べもの」を削除しますか？"],
  );
  assert.deepEqual(fake.archived, [1, 1]);
  assert.deepEqual(fake.deleted, [1]);
});

test("まとめては 1 件ずつ送り、断られたものを最後に 1 回だけ知らせる", async () => {
  const asked = answerAll();
  const chats = [1, 2, 3].map((id) => makeChat(id, { title: `チャット${id}`, archived_at: null }));
  fake.busy.add(1).add(3);
  assert.equal(await confirmArchiveChats(chats), true);
  assert.deepEqual(fake.archived, [2]);
  assert.equal(asked.length, 2);
  const [ask, told] = asked;
  assert.ok(ask.kind === "confirm" && ask.title === "3 件のチャットをアーカイブしますか？");
  assert.ok(told.kind === "confirm" && told.hideCancel);
  assert.equal(told.title, "2 件はアーカイブできませんでした");
  assert.equal(told.message, "「チャット1」: 作業中です\n「チャット3」: 作業中です");
});

test("1 件を直に渡したときは、断りを知らせずに投げる（呼ぶ側が知らせる）", async () => {
  const asked = answerAll();
  fake.busy.add(1);
  await assert.rejects(confirmArchiveChats(makeChat(1, { archived_at: null })), /作業中です/);
  assert.equal(asked.length, 1);
});
