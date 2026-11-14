import assert from "node:assert/strict";
import { test } from "node:test";
import { VIEWING_TTL_MS } from "@shared/types";
import { makeChat } from "@shared/testing/factories";
import { aiNotice, chatNotice, noticeChatName } from "./notices.js";
import { ViewingRegistry } from "./viewing.js";

test("noticeChatName: 子チャット・メモのチャットは頭に添え、名前がなければ Untitled Chat", () => {
  assert.equal(noticeChatName(makeChat(1, { title: "調査" })), "調査");
  assert.equal(noticeChatName(makeChat(2, { title: "子", parent_chat_id: 1 })), "子チャット: 子");
  assert.equal(noticeChatName(makeChat(3, { title: "", memo_path: "a.md" })), "メモ: Untitled Chat");
});

test("chatNotice: 終わった・失敗だけ。プッシュの文はチャットの名前と状態だけ（失敗の理由・プロジェクト名は載せない）", () => {
  assert.equal(chatNotice(makeChat(1, { status: "running" }), "P"), null);
  const failed = chatNotice(makeChat(1, { title: "調査", status: "failed", error: "秘密を含む失敗の文" }), "P")!;
  assert.match(failed.body, /秘密を含む/);
  assert.deepEqual(failed.push, { title: "調査", body: "失敗しました" });
});

test("ViewingRegistry: 呼び主ごとに覚え（ほかの人が見ていても自分は見ていない）、古い知らせは数えない", () => {
  let now = 0;
  const views = new ViewingRegistry(() => now);
  views.report({ kind: "host" }, { chat_id: 5, ci_project_id: null });
  assert.equal(views.viewingChat("host", 5), true);
  assert.equal(views.viewingChat(7, 5), false);
  views.report({ kind: "host" }, { chat_id: null, ci_project_id: 2 });
  assert.equal(views.viewingChat("host", 5), false);
  assert.equal(views.viewingCi("host", 2), true);
  now += VIEWING_TTL_MS + 1;
  assert.equal(views.viewingCi("host", 2), false);
});

test("aiNotice: Mac の通知には本文とプロジェクト名、プッシュにはチャットの名前と「AI からの知らせ」だけ", () => {
  const notice = aiNotice(makeChat(4, { project_id: 2, title: "移行", parent_chat_id: 1 }), "1 段目が済みました", "app");
  assert.deepEqual(notice, {
    kind: "ai_notice",
    target: { kind: "chat", project_id: 2, chat_id: 4 },
    title: "AI からの知らせ: 子チャット: 移行",
    body: "app ・ 1 段目が済みました",
    push: { title: "子チャット: 移行", body: "AI からの知らせ" },
  });
});
