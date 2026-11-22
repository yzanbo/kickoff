import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { defineSettings, family, single } from "./groups";
import { installMemoryStorage } from "./memoryStorage";
import { choice, optionalFlag, readSetting, record } from "./settings";
import { storage as legacyKeys } from "./legacyKeys";
import { storage as shellStorage } from "./storage";
import { composerHandoff, NEW_CHAT_DRAFTS } from "./storageKeys";
import { adoptDatabase, prepareStorage } from "./prepareStorage";

const { local, session } = installMemoryStorage();

// このファイルだけの群（まとまりの開閉・アプリを閉じるまで覚える ID を含むもの・ID を含まないもの）
const extra = defineSettings("tPrepare", {
  fold: family(optionalFlag(), { ids: true }),
  lastHashes: single(record(), { ids: true, session: true }),
  queueMode: choice(["queue", "tell"], "tell"),
});
const GROUPS = [shellStorage, legacyKeys, extra];
const DATABASE_ID = shellStorage.settings.databaseId;
const fold = extra.settings.fold;

/** ID を含むもの（まとまりの開閉・下書き・書きかけの文・最後に開いた画面）と、含まないもの（テーマ・送り方）を覚えておく */
function rememberSome() {
  local.setItem(fold("sidebar:p1/g3").key, "0");
  local.setItem(NEW_CHAT_DRAFTS.key, JSON.stringify({ "kanban:1": [{ key: "new:a", kind: "new", projectId: 1 }] }));
  local.setItem(composerHandoff(7).key, JSON.stringify({ chat_id: 8, title: "子" }));
  local.setItem(fold("panel:p1/g2").key, "0");
  session.setItem(extra.settings.lastHashes.key, JSON.stringify({ 1: "#/projects/1" }));
  local.setItem(shellStorage.settings.theme.key, "light");
  local.setItem(extra.settings.queueMode.key, "queue");
}

const ID_KEYS = [fold("sidebar:p1/g3").key, NEW_CHAT_DRAFTS.key, composerHandoff(7).key, fold("panel:p1/g2").key];

/** /api/status の答え（gate を渡せば、それが済むまで答えない。null ならつながらない） */
function serveStatus(databaseId: string | null, gate: Promise<void> = Promise.resolve()) {
  vi.stubGlobal("fetch", (async () => {
    await gate;
    if (databaseId === null) throw new TypeError("fetch failed");
    return new Response(JSON.stringify({ database_id: databaseId }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch);
}

test("adoptDatabase: 覚えている DB の ID と違えば（初めての起動も）ID を含む表示の設定を捨て、新しい ID を覚える。同じなら何もしない", () => {
  rememberSome();
  assert.equal(adoptDatabase(GROUPS, "db-1"), true);
  for (const key of ID_KEYS) assert.equal(local.getItem(key), null, key);
  assert.equal(session.getItem(extra.settings.lastHashes.key), null);
  assert.equal(local.getItem(shellStorage.settings.theme.key), "light");
  assert.equal(local.getItem(extra.settings.queueMode.key), "queue");
  assert.equal(readSetting(DATABASE_ID), "db-1");

  rememberSome();
  assert.equal(adoptDatabase(GROUPS, "db-1"), false);
  for (const key of ID_KEYS) assert.notEqual(local.getItem(key), null, key);

  assert.equal(adoptDatabase(GROUPS, "db-2"), true);
  for (const key of ID_KEYS) assert.equal(local.getItem(key), null, key);
});

test("prepareStorage: 宣言していない古いキーを消し、/api/status の database_id で DB を作り直したかを確かめる", async () => {
  rememberSome();
  local.setItem("kickoff:sidebar-grouping", "status");
  local.setItem("kickoff:panel-tab-grouping", "group");
  local.setItem(DATABASE_ID.key, "db-old");
  serveStatus("db-new");
  await prepareStorage(GROUPS);
  assert.equal(local.getItem("kickoff:sidebar-grouping"), null);
  assert.equal(local.getItem("kickoff:panel-tab-grouping"), null);
  for (const key of ID_KEYS) assert.equal(local.getItem(key), null, key);
  assert.equal(local.getItem(shellStorage.settings.theme.key), "light");
  assert.equal(readSetting(DATABASE_ID), "db-new");
});

test("prepareStorage: つながらなければ、ID を含むものは捨てない（古いキーは消す）", async () => {
  rememberSome();
  local.setItem("kickoff:sidebar-grouping", "status");
  serveStatus(null);
  await prepareStorage(GROUPS);
  assert.equal(local.getItem("kickoff:sidebar-grouping"), null);
  for (const key of ID_KEYS) assert.notEqual(local.getItem(key), null, key);
});

test("prepareStorage: 答えが遅ければ待たずに進め、あとで届いた答えで捨てたら読み込み直す", async () => {
  let reloaded = 0;
  vi.stubGlobal("location", { reload: () => reloaded++ });
  rememberSome();
  local.setItem(DATABASE_ID.key, "db-old");
  // 答えを返す時はテストが決める（決め打ちの時間で遅らせると、負荷が高いときに待つ長さの前後が入れ替わる）
  let answer = () => {};
  serveStatus("db-new", new Promise<void>((resolve) => (answer = resolve)));
  await prepareStorage(GROUPS, { timeoutMs: 5 });
  // まだ届いていないので、捨てていない
  assert.notEqual(local.getItem(composerHandoff(7).key), null);
  answer();
  for (let i = 0; i < 500 && reloaded === 0; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(local.getItem(composerHandoff(7).key), null);
  assert.equal(reloaded, 1);
});
