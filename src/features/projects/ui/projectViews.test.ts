import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { useTestContributions } from "@/foundation/ui/testing/contributions";
import { availableProjectViews, projectViewGroups, projectViews, resolveProjectView, type ProjectViewDef } from "./projectViews";

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
      view("board", 10, "work", { places: ["center"] }),
      view("chats", 20, "work", { places: ["center"], onlyWhenSeparate: { into: "board" } }),
      view("search", 40, "code"),
      view("db", 80, "db", { desktopOnly: true }),
      view("browser", 0, "browser", { places: ["rightSidebar"] }),
    ].map((v) => projectViews.item(v)),
  );
}

test("プロジェクトの画面の表: order の順にまとまりごとに分け、置き場所とこの Mac のアプリの中かで絞る", () => {
  install({ desktop: true });
  const groups = projectViewGroups(availableProjectViews("center"));
  assert.deepEqual(
    groups.map((g) => [g.key, g.label, g.tabs.map((t) => t.tab)]),
    [
      ["work", "チャット", ["board", "chats"]],
      ["code", "コード", ["files", "search"]],
      ["db", "DB", ["db"]],
    ],
  );
  assert.deepEqual(availableProjectViews("rightSidebar").map((v) => v.id), ["browser", "files", "search", "db"]);
});

test("プロジェクトの画面の表: URL の画面は、知らない名前・アプリの外の desktopOnly・分けない置き方のチャットをボードにする", () => {
  install({ desktop: false });
  assert.equal(resolveProjectView("files", true)?.id, "files");
  assert.equal(resolveProjectView("nope", true)?.id, "board");
  assert.equal(resolveProjectView("db", true)?.id, "board");
  assert.equal(resolveProjectView("chats", true)?.id, "chats");
  assert.equal(resolveProjectView("chats", false)?.id, "board");
});
