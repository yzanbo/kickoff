import assert from "node:assert/strict";
import { test } from "vitest";
import { installMemoryStorage } from "@/foundation/ui/testing/memoryStorage";
import { createNewChatDraft, discardNewChatDraft, draftTitleOf, newChatComposerDraft, newChatDraft, patchNewChatDraft, readNewChatDrafts } from "./newChatDrafts";
import { storage } from "./storage";

const { local } = installMemoryStorage();

test("下書きの表示名は手動の名前、本文の最初の空でない行、New Chat の順", () => {
  assert.equal(draftTitleOf(undefined), "New Chat");
  assert.equal(draftTitleOf({ text: " \n\t" }), "New Chat");
  assert.equal(draftTitleOf({ text: " \r\n  はじめの行  \r\n次の行" }), "はじめの行");
  assert.equal(draftTitleOf({ text: "一行目\r二行目" }), "一行目");
  assert.equal(draftTitleOf({ title: "付けた名前", text: "本文" }), "付けた名前");
});

test("下書きの店: 作る・変える・消す。seed の文と添付は初めの中身になり、変わらなければ書かない", () => {
  const seed = { text: "聞くこと", attachments: [{ kind: "file" as const, id: "a", name: "a.txt", mime: "text/plain", size: 1 }] };
  createNewChatDraft("new:s1", { projectId: 1, group: 2 }, seed);
  assert.deepEqual(newChatDraft("new:s1"), { key: "new:s1", projectId: 1, group: 2, text: "聞くこと", seed, attachments: seed.attachments });
  // 同じキーは作り直さない
  createNewChatDraft("new:s1", { projectId: 9 });
  assert.equal(newChatDraft("new:s1")?.projectId, 1);
  const before = readNewChatDrafts();
  patchNewChatDraft("new:s1", { group: 2 });
  assert.equal(readNewChatDrafts(), before);
  patchNewChatDraft("new:s1", { group: undefined, title: "名前" });
  assert.deepEqual(Object.keys(newChatDraft("new:s1") ?? {}).sort(), ["attachments", "key", "projectId", "seed", "text", "title"]);
  discardNewChatDraft("new:s1");
  assert.equal(newChatDraft("new:s1"), undefined);
  // 下書きがなくなったらキーごと消す
  assert.equal(local.getItem(storage.settings.newChatDrafts.key), null);
});

test("新しいチャットの入力欄の下書き: 文と添付を下書きの店に読み書きし、同じキーには同じものを返す", () => {
  createNewChatDraft("new:c1", { projectId: 1 });
  const draft = newChatComposerDraft("new:c1");
  assert.equal(newChatComposerDraft("new:c1"), draft);
  draft.write({ text: "書きかけ" });
  assert.equal(newChatDraft("new:c1")?.text, "書きかけ");
  assert.deepEqual(draft.read(), { text: "書きかけ", attachments: [] });
  discardNewChatDraft("new:c1");
});

test("残した下書きを読む: 形の違う値・キーやプロジェクトのない要素は捨てる", () => {
  local.setItem(storage.settings.newChatDrafts.key, "{");
  assert.deepEqual(readNewChatDrafts(), []);
  local.setItem(storage.settings.newChatDrafts.key, JSON.stringify([{ key: "new:a", projectId: 1 }, { key: "new:b" }, { kind: "chat" }]));
  assert.deepEqual(readNewChatDrafts(), [{ key: "new:a", projectId: 1, text: "", attachments: undefined }]);
  local.removeItem(storage.settings.newChatDrafts.key);
});
