import assert from "node:assert/strict";
import { onTestFinished, test, vi } from "vitest";
import { installMemoryStorage } from "@/foundation/ui/storage/memoryStorage";
import type { WindowMessageMap } from "@/foundation/ui/navigation/windowBus";
import { popoutKinds } from "@/foundation/ui/navigation/popout";
import { useTestContributions } from "@/foundation/ui/testing/contributions";
import { useTestPanelStore } from "@/features/panel/ui/testing";
import { newChatTab } from "@/features/panel/ui/tabs/tabData";
import { openTab } from "./actions";
import { forwardPanelOp, sendPanelsWhileChanging } from "./panelMirror";
import { allPanels, dispatchPanel, panelStateOf, replacePanels, setPanelReplica } from "./panelStore";
import type { PanelState } from "./panelState";

installMemoryStorage();

/** 写しの店にする（テストのあとに、元の状態と本物の店に戻す） */
function becomeReplica() {
  const before = [...allPanels()];
  setPanelReplica(true);
  onTestFinished(() => {
    setPanelReplica(false);
    replacePanels(before);
  });
}

test("メインのウィンドウ: いまのパネルの写しを送り、変わったらまとめて送り直す", () => {
  useTestPanelStore();
  vi.useFakeTimers();
  onTestFinished(() => void vi.useRealTimers());
  const sent: WindowMessageMap["mainPanels"][] = [];
  const stop = sendPanelsWhileChanging((m) => sent.push(m));
  onTestFinished(stop);
  assert.equal(sent.length, 1);
  const key = "kanban:9101";
  openTab(key, newChatTab("new:9101"));
  dispatchPanel(key, { type: "setOpen", open: false });
  // 続けて変えても 1 回にまとめる
  assert.equal(sent.length, 1);
  vi.advanceTimersByTime(100);
  assert.equal(sent.length, 2);
  const last = sent[1];
  assert.equal(last.panels.find(([k]) => k === key)?.[1].tabs.length, 1);
  // やめたら送らない
  stop();
  dispatchPanel(key, { type: "setOpen", open: true });
  vi.advanceTimersByTime(100);
  assert.equal(sent.length, 2);
});

test("写しの店: 届いた状態に置き換え、自分では変えない（下書きの操作は chatPanel の panelDrafts.test.ts）", () => {
  useTestPanelStore();
  becomeReplica();
  const key = "kanban:9102";
  const state: PanelState = { ...panelStateOf(key), tabs: [{ kind: "new", key: "new:1" }] };
  replacePanels([[key, state]]);
  assert.deepEqual([...allPanels().keys()], [key]);
  dispatchPanel(key, { type: "close", keys: ["new:1"], dismiss: false });
  assert.equal(panelStateOf(key), state);
});

test("forwardPanelOp: サイドバーの別ウィンドウの中だけメインのウィンドウに頼み、メインのウィンドウではそのまま行う", () => {
  useTestPanelStore();
  // サイドバーの別ウィンドウの種類（本物の表は sidebar の ui/popoutKinds.ts）
  useTestContributions([popoutKinds.item({ kind: "sidebar", fields: {} })]);
  vi.stubGlobal("location", { hash: "#/projects/1" });
  assert.equal(forwardPanelOp({ op: "discardDraft", draft: { panel: "kanban:1", key: "new:1" } }), false);
  vi.stubGlobal("location", { hash: "#/popout/sidebar" });
  vi.stubGlobal("window", { kickoff: { windows: { focusMain: async () => {} } } });
  assert.equal(forwardPanelOp({ op: "discardDraft", draft: { panel: "kanban:1", key: "new:1" } }), true);
});
