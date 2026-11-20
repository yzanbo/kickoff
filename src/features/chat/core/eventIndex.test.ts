import assert from "node:assert/strict";
import { test } from "vitest";
import type { SQLInputValue } from "node:sqlite";
import { testStore } from "@/app/core/testing/testStore";

/** 記録の店の読み取りを 1 回ずつ呼び、流した SELECT の文を集める（チャットごとの読み取りだけ） */
function readStatements() {
  const store = testStore();
  const project = store.projects.create({ name: "p", repo_path: "/tmp/p", provider: "claude" });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  const other = store.chats.create({ project_id: project.id, provider: "claude", title: "d", status: "completed" });
  const first = store.events.add(chat.id, { type: "user", text: "はじめ", message_uuid: "u1" });
  store.events.add(chat.id, { type: "text", text: "答え" });
  const last = store.events.add(chat.id, { type: "result", status: "completed", session_id: "s1" });
  const seen: string[] = [];
  const prepare = store.db.prepare.bind(store.db);
  store.db.prepare = (sql: string) => (seen.push(sql), prepare(sql));
  const e = store.events;
  const [a, b] = [first.id, last.id];
  e.get(a);
  e.recent(chat.id, 5);
  e.list(chat.id);
  e.after(chat.id, a);
  e.before(chat.id, b, 5);
  e.before(chat.id, null, 5);
  e.range(chat.id, a, b);
  e.byIds(chat.id, [a, b]);
  e.metas(chat.id, a, b);
  e.resultIdsBefore(chat.id, b, 5);
  e.resultIdsFrom(chat.id, a, b, 5);
  e.latestMainTextId(chat.id);
  e.hasBetween(chat.id, a, b);
  e.mainTexts(chat.id, b);
  e.hasBefore(chat.id, b);
  e.has(chat.id, a);
  e.hasToolResultWith(chat.id, "x");
  e.conversation(chat.id);
  e.latestUserId(chat.id);
  e.latestResultId(chat.id);
  e.latestUnreadId(chat.id);
  e.sessionRecords(chat.id);
  e.pendingWorkplaceMove(chat.id);
  e.workplaceMoves(chat.id);
  e.uploadIdsIn([chat.id, other.id]);
  store.db.prepare = prepare;
  const statements = [...new Set(seen)].filter((sql) => /^\s*SELECT/i.test(sql) && /\bchat_events\b/.test(sql) && /\bchat_id\b/.test(sql));
  return { store, statements };
}

/** 文の計画（値は NULL で見る） */
function planOf(store: ReturnType<typeof testStore>, sql: string): string[] {
  const params = (sql.match(/\?/g) ?? []).map((): SQLInputValue => null);
  return (store.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as { detail: string }[]).map((r) => r.detail);
}

test("記録の店のチャットごとの読み取りは、どれも覆う索引 idx_chat_events_meta か主キーで引く（(chat_id, id) の索引 idx_chat_events_chat を足しても引き方は同じなので作らない）", () => {
  const { store, statements } = readStatements();
  assert.ok(statements.length >= 20, `読み取りの文が少ない: ${statements.length}`);
  assert.equal(store.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'idx_chat_events_chat'").get()?.n, 0);
  const plans = statements.map((sql) => planOf(store, sql));
  statements.forEach((sql, i) => {
    const steps = plans[i].filter((d) => /^(SEARCH|SCAN) /.test(d));
    assert.ok(steps.length > 0, sql);
    for (const step of steps) assert.match(step, /USING (COVERING )?INDEX idx_chat_events_meta|USING INTEGER PRIMARY KEY/, `${sql}\n→ ${step}`);
  });
  // 足すと、覆わない読み取りは細い方の索引を選ぶが、引く列（chat_id・id の範囲）は同じ（索引の名前と覆うかだけが違う）
  const way = (plan: string[]) => plan.map((d) => d.replace(/USING (COVERING )?INDEX idx_chat_events_(chat|meta)/, "USING INDEX"));
  store.db.exec("CREATE INDEX idx_chat_events_chat ON chat_events(chat_id, id)");
  statements.forEach((sql, i) => assert.deepEqual(way(planOf(store, sql)), way(plans[i]), sql));
});
