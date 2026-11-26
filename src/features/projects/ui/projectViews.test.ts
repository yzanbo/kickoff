import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { useTestContributions } from "@/foundation/ui/testing/contributions";
import { allProjectViewGroups, availableProjectViews, projectViewGroups, projectViews, resolveProjectView, type ProjectViewDef } from "./projectViews";

const Page = () => null;
const view = (id: string, order: number, group: ProjectViewDef["group"], more: Partial<ProjectViewDef> = {}): ProjectViewDef => ({
  id,
  label: id,
  icon: (() => null) as unknown as ProjectViewDef["icon"],
  group,
  order,
  places: ["center", "rightSidebar"],
  Page,
  ...more,
});

/** 登録の順に関係なく order で並び、まとまりごとに分ける */
function install({ desktop }: { desktop: boolean }) {
  vi.stubGlobal("window", desktop ? { kickoff: {} } : {});
  useTestContributions(
    [
      view("files", 30, "code"),
      view("board", 10, "work", { places: ["center"], common: true }),
      view("chats", 20, "work", { places: ["center"], onlyWhenSeparate: { into: "board" }, common: true }),
      view("search", 40, "code"),
      view("notes", 70, "notes", { common: true }),
      view("db", 80, "db", { desktopOnly: true }),
      view("browser", 0, "browser", { places: ["rightSidebar"], common: true }),
    ].map((v) => projectViews.item(v)),
  );
}

test("プロジェクトの画面の表: order の順にまとまりごとに分け、置き場所とこの Mac のアプリの中かで絞る", () => {
  install({ desktop: true });
  const groups = projectViewGroups(availableProjectViews("center", false));
  assert.deepEqual(
    groups.map((g) => [g.key, g.label, g.tabs.map((t) => t.tab)]),
    [
      ["work", "チャット", ["board", "chats"]],
      ["code", "コード", ["files", "search"]],
      ["notes", "ノート", ["notes"]],
      ["db", "DB", ["db"]],
    ],
  );
  assert.deepEqual(availableProjectViews("rightSidebar", false).map((v) => v.id), ["browser", "files", "search", "notes", "db"]);
});

test("プロジェクトの画面の表: 共通は common を付けた画面だけ（作業フォルダ・Git・DB などは出さない）", () => {
  install({ desktop: true });
  assert.deepEqual(availableProjectViews("center", true).map((v) => v.id), ["board", "chats", "notes"]);
  assert.deepEqual(availableProjectViews("rightSidebar", true).map((v) => v.id), ["browser", "notes"]);
  // 共通で出さない画面の URL はボード
  assert.equal(resolveProjectView("files", true, true)?.id, "board");
  assert.equal(resolveProjectView("notes", true, true)?.id, "notes");
  // 並べ替えの全体は共通でも絞らない（ふつうのプロジェクトの真ん中の画面のまとまり）
  assert.deepEqual(allProjectViewGroups(), projectViewGroups(availableProjectViews("center", false)));
  assert.deepEqual(allProjectViewGroups().flatMap((g) => g.tabs.map((t) => t.tab)), ["board", "chats", "files", "search", "notes", "db"]);
});

test("プロジェクトの画面の表: URL の画面は、知らない名前・アプリの外の desktopOnly・分けない置き方のチャットをボードにする", () => {
  install({ desktop: false });
  assert.equal(resolveProjectView("files", true, false)?.id, "files");
  assert.equal(resolveProjectView("nope", true, false)?.id, "board");
  assert.equal(resolveProjectView("db", true, false)?.id, "board");
  assert.equal(resolveProjectView("chats", true, false)?.id, "chats");
  assert.equal(resolveProjectView("chats", false, false)?.id, "board");
  assert.equal(resolveProjectView("chats", false, true)?.id, "board");
});
