import assert from "node:assert/strict";
import { afterAll, test, vi } from "vitest";
import { useTestContributions } from "@/foundation/ui/testing/contributions";
import { panelSurfaces, panelTabs, type PanelSurface, type PanelTab } from "@/features/panel/ui";
import { userViewTabs } from "@/features/userView/ui";
import { registryContributions } from "./registry";

// GitHub の本文の部品は DOMPurify（画面のもの）を読み込みで使う（登録の網羅だけを確かめる）
vi.mock("@/features/github/ui/GitHubHtml", () => ({ GitHubHtml: () => null }));
// 全部の機能の部品を読み込むので、同じプロセスで続けて流れるファイルのモック（vi.mock）が効くよう、読み込んだものを捨てる
afterAll(() => vi.resetModules());

/** パネルのタブの種類（panelTypes.ts の PanelTab の kind）と欄（surface.ts の PanelSurface）のすべて */
const KINDS: readonly PanelTab["kind"][] = ["chat", "new", "subagent", "changes", "file", "projectView", "projectFile", "note", "child", "newChild", "browser", "terminal"];
const SURFACES: readonly PanelSurface[] = ["kanban", "side", "bottom", "agents", "notes", "files", "win", "cwin"];
test("登録の網羅: タブの種類 12 と欄 8 がどれも 1 つずつ登録され（同じ id は点が断る）、どの種類にも AI への説明がある", () => {
  useTestContributions(registryContributions());
  assert.deepEqual(panelTabs.items().map((k) => k.id).sort(), [...KINDS].sort());
  assert.deepEqual(panelSurfaces.items().map((s) => s.id).sort(), [...SURFACES].sort());
  const described = new Set(userViewTabs.items().map((d) => d.kind));
  assert.deepEqual(KINDS.filter((k) => !described.has(k)), []);
  // 欄の呼び名（AI に返す「どこのペインか」）は欄ごとに違う
  assert.equal(new Set(panelSurfaces.items().map((s) => s.label)).size, SURFACES.length);
});

test("作業場所を移したときの付け替え: 作業場所を持つ右の欄の種類（変更・ファイル・プロジェクトの画面）は repoint を持つ", () => {
  useTestContributions(registryContributions());
  const repointing = panelTabs.items().filter((k) => k.repoint).map((k) => k.id).sort();
  assert.deepEqual(repointing, ["changes", "file", "projectView"]);
});
