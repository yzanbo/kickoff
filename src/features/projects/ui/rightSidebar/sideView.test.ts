import { test, vi } from "vitest";
import assert from "node:assert/strict";
import { useTestContributions } from "@/foundation/ui/testing/contributions";
import { projectViews, type ProjectViewDef } from "@/features/projects/ui/projectViews";
import { sideViewOf } from "./sideView";

const view = (id: string, places: ProjectViewDef["places"], more: Partial<ProjectViewDef> = {}): ProjectViewDef =>
  ({ id, label: id, icon: (() => null) as unknown as ProjectViewDef["icon"], group: "code", order: 0, places, Page: () => null, ...more });

test("覚えた値を右サイドバーの中身にする（右サイドバーに置けない画面・アプリの外の desktopOnly・空・知らない値はブラウザ）", () => {
  vi.stubGlobal("window", {});
  useTestContributions(
    [view("browser", ["rightSidebar"]), view("board", ["center"]), view("notes", ["center", "rightSidebar"]), view("ci", ["center", "rightSidebar"], { desktopOnly: true })].map((v) => projectViews.item(v)),
  );
  assert.equal(sideViewOf("notes"), "notes");
  assert.equal(sideViewOf("board"), "browser");
  assert.equal(sideViewOf("ci"), "browser");
  assert.equal(sideViewOf(""), "browser");
  assert.equal(sideViewOf("nope"), "browser");
});
