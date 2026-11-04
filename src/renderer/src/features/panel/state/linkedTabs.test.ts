import assert from "node:assert/strict";
import { test } from "node:test";
import type { Run } from "@shared/types";
import { NO_LINKS, syncLinkedTabs } from "./linkedTabs";
import type { PanelTab } from "@/features/panel/usePanel";

const run = (id: number) => ({ id, project_id: 1, title: `チャット${id}` }) as Run;
const chat = (id: number): PanelTab => ({ key: `chat:${id}`, kind: "chat", id, projectId: 1, title: `チャット${id}` });
const browser: PanelTab = { key: "browser:1", kind: "browser", url: "", title: "" };
const ids = (tabs: PanelTab[]) => tabs.map((t) => t.key);

test("サイドバーとの連動: 一覧にあってタブのないチャットを一覧の並びで足し、一覧から外れたチャットのタブは閉じる", () => {
  const { tabs } = syncLinkedTabs([chat(1), browser, chat(9)], [run(3), run(1), run(2)], NO_LINKS);
  assert.deepEqual(ids(tabs), ["chat:1", "browser:1", "chat:3", "chat:2"]);
});

test("サイドバーとの連動: 変わらなければ同じ配列と同じ覚えを返す", () => {
  const before = [chat(1), chat(2)];
  const links = { dismissed: [2], extra: [] };
  const next = syncLinkedTabs(before, [run(1), run(2)], links);
  assert.equal(next.tabs, before);
  assert.equal(next.links, links);
});

test("サイドバーとの連動: 表示だけ消したチャットは足さず、一覧から外れたら忘れる", () => {
  const first = syncLinkedTabs([chat(1)], [run(1), run(2)], { dismissed: [2], extra: [] });
  assert.deepEqual(ids(first.tabs), ["chat:1"]);
  const gone = syncLinkedTabs(first.tabs, [run(1)], first.links);
  assert.deepEqual(gone.links.dismissed, []);
});

test("サイドバーとの連動: 一覧にないのに自分で開いたチャット（extra）は残し、一覧に入ったら extra から外す", () => {
  const kept = syncLinkedTabs([chat(1), chat(5)], [run(1)], { dismissed: [], extra: [5] });
  assert.deepEqual(ids(kept.tabs), ["chat:1", "chat:5"]);
  const joined = syncLinkedTabs(kept.tabs, [run(1), run(5)], kept.links);
  assert.deepEqual(joined.links.extra, []);
  // extra でなくなったので、次に一覧から外れたら閉じる
  assert.deepEqual(ids(syncLinkedTabs(joined.tabs, [run(1)], joined.links).tabs), ["chat:1"]);
});
