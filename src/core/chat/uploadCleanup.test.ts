import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { Store } from "../db/store.js";
import { tempDir } from "../testing/tempDir.js";
import { UNUSED_UPLOAD_KEEP_MS, sweepUnusedUploads } from "./uploadCleanup.js";
import { UploadStore } from "./uploads.js";

test("送らなかった添付: 保存してから 30 日たち、記録（ゴミ箱のチャットも）・送信待ちのどれも使っていないものだけを消す", async () => {
  const store = new Store(":memory:", () => {});
  const uploads = new UploadStore(tempDir());
  const project = store.projects.create({ name: "p", repo_path: "/work/p", provider: "claude" });
  const chat = store.chats.create({ project_id: project.id, title: "c", provider: "claude", status: "completed" });
  const sent = await uploads.save({ name: "sent.png", type: "image/png", bytes: new Uint8Array([1]) });
  const draft = await uploads.save({ name: "draft.png", type: "image/png", bytes: new Uint8Array([2]) });
  const queued = await uploads.save({ name: "queued.png", type: "image/png", bytes: new Uint8Array([3]) });
  store.events.add(chat.id, { type: "user", text: "見て", attachments: [sent] } as never);
  store.queues.save({ chatId: chat.id, messages: [{ id: "q1", text: "あとで", attachments: [queued] }], paused: false, stops: [] } as never);
  // 保存したばかりなら消さない
  assert.equal(await sweepUnusedUploads({ store, uploads }), 0);
  // ゴミ箱に入れたチャットの添付も残す
  store.chats.trash([chat.id], "item-1");
  assert.equal(await sweepUnusedUploads({ store, uploads }, Date.now() + UNUSED_UPLOAD_KEEP_MS + 60_000), 1);
  assert.ok(await uploads.resolve(sent.id));
  assert.ok(await uploads.resolve(queued.id));
  assert.equal(await uploads.resolve(draft.id), undefined);
  assert.equal(fs.existsSync(path.join(uploads.dir, draft.id)), false);
});
