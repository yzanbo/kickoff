import { test, vi } from "vitest";
import assert from "node:assert/strict";
import { useTestContributions } from "@/foundation/ui/testing/contributions";
import { projectViews, type ProjectViewDef } from "@/features/projects/ui/projectViews";
import { sideViewOf } from "./sideView";

const view = (id: string, places: ProjectViewDef["places"], more: Partial<ProjectViewDef> = {}): ProjectViewDef =>
  ({ id, label: id, icon: (() => null) as unknown as ProjectViewDef["icon"], group: "code", order: 0, places, Page: () => null, ...more });

test("覚えた値を右サイドバーの中身にする（右サイドバーに置けない画面・アプリの外の desktopOnly・共通で出さない画面・空・知らない値はブラウザ）", () => {
  vi.stubGlobal("window", {});
  useTestContributions(
    [
      view("browser", ["rightSidebar"], { common: true }),
      view("board", ["center"], { common: true }),
      view("notes", ["center", "rightSidebar"], { common: true }),
      view("files", ["center", "rightSidebar"]),
      view("ci", ["center", "rightSidebar"], { desktopOnly: true }),
    ].map((v) => projectViews.item(v)),
  );
  assert.equal(sideViewOf("notes", false), "notes");
  assert.equal(sideViewOf("files", false), "files");
  assert.equal(sideViewOf("board", false), "browser");
  assert.equal(sideViewOf("ci", false), "browser");
  assert.equal(sideViewOf("", false), "browser");
  assert.equal(sideViewOf("nope", false), "browser");
  // 共通は common の画面だけ（ファイルを覚えていたらブラウザ）
  assert.equal(sideViewOf("notes", true), "notes");
  assert.equal(sideViewOf("files", true), "browser");
});
