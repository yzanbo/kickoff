import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { useTestContributions } from "@/foundation/ui/testing/contributions";
import { askRouteLeave, configureRouter, href, lastingRoute, navigate, parse, reopened, routeLeaveGuards, routeProjectId, type Route, type RouteChangeEvent } from "./router";

// 知っているプロジェクトの画面（本物は app/renderer/registry.ts が入れる）
configureRouter({ projectViews: ["board", "chats", "files", "search", "changes", "history", "notes"], defaultView: "board" });

test("parse: ハッシュを画面に読む（タブなしはボード、知らないタブはボード、知らない形は全プロジェクト）", () => {
  assert.deepEqual(parse(""), { name: "allProjects" });
  assert.deepEqual(parse("#/"), { name: "allProjects" });
  assert.deepEqual(parse("#/nowhere"), { name: "allProjects" });
  assert.deepEqual(parse("#/notes"), { name: "allNotes" });
  assert.deepEqual(parse("#/notes/x"), { name: "allProjects" });
  assert.deepEqual(parse("#/projects/3"), { name: "project", id: 3, tab: "board" });
  assert.deepEqual(parse("#/projects/3/changes"), { name: "project", id: 3, tab: "changes" });
  assert.deepEqual(parse("#/projects/3/history"), { name: "project", id: 3, tab: "history" });
  assert.deepEqual(parse("#/projects/3/unknown"), { name: "project", id: 3, tab: "board" });
});

test("parse: ファイルタブで開くファイル（ファイルタブでだけ読む。行は 1 以上の整数だけ）", () => {
  assert.deepEqual(parse("#/projects/3/files?file=src%2Fa.ts&line=12&worktree=%2Fw%2Fx"), {
    name: "project",
    id: 3,
    tab: "files",
    file: { path: "src/a.ts", line: 12, worktree: "/w/x" },
  });
  assert.deepEqual(parse("#/projects/3/files?file=a.ts&line=0"), { name: "project", id: 3, tab: "files", file: { path: "a.ts" } });
  assert.deepEqual(parse("#/projects/3/files?line=4"), { name: "project", id: 3, tab: "files" });
  assert.deepEqual(parse("#/projects/3/search"), { name: "project", id: 3, tab: "search" });
  assert.deepEqual(parse("#/projects/3/history?file=a.ts"), { name: "project", id: 3, tab: "history" });
  // 開くノートはノートのタブでだけ読む
  assert.deepEqual(parse("#/projects/3/changes?note=a.md"), { name: "project", id: 3, tab: "changes" });
  // ノートで移る行は、開くノートがあるときだけ（0・数でないものは付けない）
  assert.deepEqual(parse("#/projects/3/notes?note=a.md&line=7"), { name: "project", id: 3, tab: "notes", note: "a.md", noteLine: 7 });
  assert.deepEqual(parse("#/projects/3/notes?note=a.md&line=0"), { name: "project", id: 3, tab: "notes", note: "a.md" });
  assert.deepEqual(parse("#/projects/3/notes?line=7"), { name: "project", id: 3, tab: "notes" });
});

test("parse: 新しいチャットとチャット（focus は 0 なら付けない）", () => {
  assert.deepEqual(parse("#/projects/3/new"), { name: "newChat", projectId: 3 });
  assert.deepEqual(parse("#/projects/3/new?group=2"), { name: "newChat", projectId: 3, group: 2 });
  assert.deepEqual(parse("#/projects/3/chats/12"), { name: "chat", projectId: 3, chatId: 12 });
  assert.deepEqual(parse("#/projects/3/chats/12?event=99"), { name: "chat", projectId: 3, chatId: 12, focus: 99 });
  assert.deepEqual(parse("#/projects/3/chats/12?event=0"), { name: "chat", projectId: 3, chatId: 12 });
});

test("href と parse の往復: 画面 → URL → 画面で同じになる", () => {
  const routes: Route[] = [
    { name: "allProjects" },
    { name: "allNotes" },
    { name: "project", id: 1, tab: "board" },
    { name: "project", id: 1, tab: "changes" },
    { name: "project", id: 1, tab: "history" },
    { name: "project", id: 1, tab: "files", file: { path: "src/a b.ts", line: 3, worktree: "/x/app-worktrees/w" } },
    { name: "project", id: 1, tab: "files", file: { path: "README.md" } },
    { name: "project", id: 1, tab: "files" },
    { name: "project", id: 1, tab: "search" },
    { name: "project", id: 1, tab: "notes" },
    { name: "project", id: 1, tab: "chats" },
    { name: "project", id: 1, tab: "notes", note: "設計/DB の方針.md" },
    { name: "project", id: 1, tab: "notes", note: "設計/DB の方針.md", noteLine: 12 },
    { name: "newChat", projectId: 2, group: 4 },
    { name: "newChat", projectId: 2, worktree: "/x/app-worktrees/feature-a b" },
    { name: "newChat", projectId: 2, group: 4, worktree: "/x/app-worktrees/w" },
    { name: "chat", projectId: 2, chatId: 30 },
    { name: "chat", projectId: 2, chatId: 30, focus: 8 },
  ];
  for (const route of routes) {
    assert.deepEqual(parse(href(route)), route, href(route));
  }
  assert.equal(href({ name: "project", id: 1, tab: "board" }), "#/projects/1");
  assert.equal(href({ name: "newChat", projectId: 2 }), "#/projects/2/new");
});

test("routeProjectId: プロジェクトの画面・新しいチャット・チャットはそのプロジェクト、全プロジェクト・全ノートは null", () => {
  assert.equal(routeProjectId({ name: "allNotes" }), null);
  assert.equal(routeProjectId({ name: "project", id: 4, tab: "board" }), 4);
  assert.equal(routeProjectId({ name: "newChat", projectId: 5 }), 5);
  assert.equal(routeProjectId({ name: "chat", projectId: 6, chatId: 1 }), 6);
  assert.equal(routeProjectId({ name: "allProjects" }), null);
});

test("lastingRoute: 起動したときに開く画面として覚えるのは、一度きりの指定（開くファイル・ノート・強調する発言）を外した形", () => {
  assert.equal(href(lastingRoute(parse("#/projects/3/files?file=src%2Fa.ts&line=4"))), "#/projects/3/files");
  assert.equal(href(lastingRoute(parse("#/projects/3/notes?note=a.md"))), "#/projects/3/notes");
  assert.equal(href(lastingRoute(parse("#/projects/3/notes?note=a.md&line=4"))), "#/projects/3/notes");
  assert.equal(href(lastingRoute(parse("#/projects/3/chats/9?event=12"))), "#/projects/3/chats/9");
  assert.equal(href(lastingRoute(parse("#/projects/3/changes"))), "#/projects/3/changes");
  assert.equal(href(lastingRoute(parse("#/projects/3/new?group=2"))), "#/projects/3/new?group=2");
  assert.equal(href(lastingRoute(parse("#/"))), "#/");
  assert.equal(href(lastingRoute(parse("#/notes"))), "#/notes");
});

test("navigate: replace は画面の履歴も置き換える通知を添え、通常の移動とは区別できる", () => {
  const target = new EventTarget();
  const location = { hash: "#/projects/3/new" };
  const replacements: string[] = [];
  vi.stubGlobal("window", target);
  vi.stubGlobal("location", location);
  vi.stubGlobal("HashChangeEvent", class extends Event {});
  vi.stubGlobal("history", {
    replaceState: (_state: unknown, _title: string, url: string) => {
      replacements.push(url);
      location.hash = url;
    },
  });
  const received: { hash: string; replace: boolean }[] = [];
  target.addEventListener("hashchange", (event) => received.push({ hash: location.hash, replace: Boolean((event as RouteChangeEvent).routeReplace) }));

  navigate({ name: "chat", projectId: 3, chatId: 9 }, { replace: true });
  assert.deepEqual(replacements, ["#/projects/3/chats/9"]);
  assert.deepEqual(received, [{ hash: "#/projects/3/chats/9", replace: true }]);
  navigate({ name: "project", id: 3, tab: "notes" });
  assert.equal(location.hash, "#/projects/3/notes");
  assert.equal(replacements.length, 1);
});

test("navigate: 同じチャット・新しいチャットを開き直したら（URL が変わらない）reopened で知らせ、ほかの画面は知らせない", () => {
  const location = { hash: "#/projects/3/chats/9" };
  vi.stubGlobal("location", location);
  const got: Route[] = [];
  const off = reopened.subscribe((route) => got.push(route));
  navigate({ name: "chat", projectId: 3, chatId: 9 });
  location.hash = "#/projects/3";
  navigate({ name: "project", id: 3, tab: "board" });
  off();
  assert.deepEqual(got, [{ name: "chat", projectId: 3, chatId: 9 }]);
});

test("askRouteLeave: 登録した確かめのうち、初めに聞くものを返す（どれも聞かなければ null）", async () => {
  const from: Route = { name: "project", id: 3, tab: "files" };
  const seen: string[] = [];
  useTestContributions([
    routeLeaveGuards.item((a, b) => (seen.push(`${href(a)}>${href(b)}`), null)),
    routeLeaveGuards.item((_, to) => (to.name === "allProjects" ? Promise.resolve(false) : null)),
  ]);
  assert.equal(askRouteLeave(from, { name: "project", id: 4, tab: "files" }), null);
  assert.equal(await askRouteLeave(from, { name: "allProjects" }), false);
  assert.deepEqual(seen, ["#/projects/3/files>#/projects/4/files", "#/projects/3/files>#/"]);
});
