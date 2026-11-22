import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { installMemoryStorage } from "@/foundation/ui/storage/memoryStorage";
import { popoutKinds } from "@/foundation/ui/navigation/popout";
import { useTestContributions } from "@/foundation/ui/testing/contributions";
import { useTestPanelStore } from "@/features/panel/ui/testing";
import { forwardPanelOp } from "./panelMirror";

installMemoryStorage();

test("forwardPanelOp: サイドバーの別ウィンドウの中だけメインのウィンドウに頼み、メインのウィンドウではそのまま行う", () => {
  useTestPanelStore();
  // サイドバーの別ウィンドウの種類（本物の表は sidebar の ui/popoutKinds.ts）
  useTestContributions([popoutKinds.item({ kind: "sidebar", fields: {}, label: "", Page: () => null })]);
  vi.stubGlobal("location", { hash: "#/projects/1" });
  assert.equal(forwardPanelOp({ op: "discardDraft", draft: { panel: "kanban:1", key: "new:1" } }), false);
  vi.stubGlobal("location", { hash: "#/popout/sidebar" });
  vi.stubGlobal("window", { kickoff: { windows: { focusMain: async () => {} } } });
  assert.equal(forwardPanelOp({ op: "discardDraft", draft: { panel: "kanban:1", key: "new:1" } }), true);
});
