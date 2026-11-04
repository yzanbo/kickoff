import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { installMemoryStorage } from "@/lib/memoryStorage";
import { readSetting } from "@/lib/storage";
import { DATABASE_ID } from "@/lib/storageKeys";
import { adoptDatabase, prepareStorage } from "./prepareStorage";

const { local, session } = installMemoryStorage();

/** ID を含むもの（グループの開閉・下書き・書きかけの文・最後に開いた画面）と、含まないもの（テーマ・送り方）を覚えておく */
function rememberSome() {
  local.setItem("kickoff:group-closed:3", "1");
  local.setItem("kickoff:new-chat-drafts", JSON.stringify({ "kanban:1": [{ key: "new:a", kind: "new", projectId: 1 }] }));
  local.setItem("kickoff:chat-draft:7", "書きかけ");
  local.setItem("kickoff:panel-tab-clusters-collapsed", JSON.stringify(["p1:g2"]));
  session.setItem("kickoff:last-hash-by-project", JSON.stringify({ 1: "#/projects/1" }));
  local.setItem("kickoff:theme", "light");
  local.setItem("kickoff:queue-mode", "queue");
}

const ID_KEYS = ["kickoff:group-closed:3", "kickoff:new-chat-drafts", "kickoff:chat-draft:7", "kickoff:panel-tab-clusters-collapsed"];

/** /api/status の答え（ms だけ遅らせる。null ならつながらない） */
function serveStatus(databaseId: string | null, ms = 0) {
  globalThis.fetch = (async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    if (databaseId === null) throw new TypeError("fetch failed");
    return new Response(JSON.stringify({ database_id: databaseId }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

beforeEach(() => {
  local.clear();
  session.clear();
});

test("adoptDatabase: 覚えている DB の ID と違えば（初めての起動も）ID を含む表示の設定を捨て、新しい ID を覚える。同じなら何もしない", () => {
  rememberSome();
  assert.equal(adoptDatabase("db-1"), true);
  for (const key of ID_KEYS) assert.equal(local.getItem(key), null, key);
  assert.equal(session.getItem("kickoff:last-hash-by-project"), null);
  assert.equal(local.getItem("kickoff:theme"), "light");
  assert.equal(local.getItem("kickoff:queue-mode"), "queue");
  assert.equal(readSetting(DATABASE_ID), "db-1");

  rememberSome();
  assert.equal(adoptDatabase("db-1"), false);
  for (const key of ID_KEYS) assert.notEqual(local.getItem(key), null, key);

  assert.equal(adoptDatabase("db-2"), true);
  for (const key of ID_KEYS) assert.equal(local.getItem(key), null, key);
});

test("prepareStorage: 宣言していない古いキーを消し、/api/status の database_id で DB を作り直したかを確かめる", async () => {
  rememberSome();
  local.setItem("kickoff:sidebar-grouping", "status");
  local.setItem("kickoff:panel-tab-grouping", "group");
  local.setItem(DATABASE_ID.key, "db-old");
  serveStatus("db-new");
  await prepareStorage();
  assert.equal(local.getItem("kickoff:sidebar-grouping"), null);
  assert.equal(local.getItem("kickoff:panel-tab-grouping"), null);
  for (const key of ID_KEYS) assert.equal(local.getItem(key), null, key);
  assert.equal(local.getItem("kickoff:theme"), "light");
  assert.equal(readSetting(DATABASE_ID), "db-new");
});

test("prepareStorage: つながらなければ、ID を含むものは捨てない（古いキーは消す）", async () => {
  rememberSome();
  local.setItem("kickoff:sidebar-grouping", "status");
  serveStatus(null);
  await prepareStorage();
  assert.equal(local.getItem("kickoff:sidebar-grouping"), null);
  for (const key of ID_KEYS) assert.notEqual(local.getItem(key), null, key);
});

test("prepareStorage: 答えが遅ければ待たずに進め、あとで届いた答えで捨てたら読み込み直す", async () => {
  let reloaded = 0;
  Object.assign(globalThis, { location: { reload: () => reloaded++ } });
  rememberSome();
  local.setItem(DATABASE_ID.key, "db-old");
  serveStatus("db-new", 30);
  await prepareStorage(5);
  // まだ届いていないので、捨てていない
  assert.notEqual(local.getItem("kickoff:chat-draft:7"), null);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(local.getItem("kickoff:chat-draft:7"), null);
  assert.equal(reloaded, 1);
});
