import assert from "node:assert/strict";
import { onTestFinished, test, vi } from "vitest";
import { installMemoryStorage } from "@/foundation/ui/testing/memoryStorage";
import { popoutKinds } from "@/foundation/ui/navigation/popout";
import { useTestContributions } from "@/foundation/ui/testing/contributions";
import { dispatchPanel, panelStateOf } from "@/features/panel/ui";
import { useChatPanelTestStore } from "@/features/chatPanel/ui/testing";
import { discardDraft, draftOfPanelTab, openDraft, openNewChat, placedDrafts, restoreDraftTabs, setDraftGroup } from "./panelDrafts";

installMemoryStorage();

const keys = (panel: string) => panelStateOf(panel).tabs.map((t) => t.key);
/** 下書きの店の中身（タブのある欄によらない） */
const draftOf = (key: string) => draftOfPanelTab("", { kind: "new", key });

test("下書き: 下書きの店に作ってタブを開き、タブのある欄と表示しているかを添えて出す。グループを変える・消すは店とタブに効く", () => {
  useChatPanelTestStore();
  const a = openNewChat("kanban:7", { projectId: 7 });
  const b = openNewChat("kanban:8", { projectId: 8, group: 2 });
  assert.deepEqual(keys("kanban:7"), [a]);
  assert.deepEqual(
    placedDrafts().map((d) => [d.key, d.panel, d.group, d.showing]),
    [
      [a, "kanban:7", undefined, true],
      [b, "kanban:8", 2, true],
    ],
  );
  // 下書きも置き場所も変わらなければ同じ配列
  assert.equal(placedDrafts(), placedDrafts());
  setDraftGroup({ panel: "kanban:7", key: a }, 3, "実装");
  assert.equal(draftOf(a)?.group, 3);
  assert.equal(draftOf(b)?.group, 2);
  discardDraft({ panel: "kanban:8", key: b });
  assert.deepEqual(keys("kanban:8"), []);
  assert.equal(draftOf(b), undefined);
  discardDraft({ panel: "kanban:7", key: a });
  assert.equal(draftOf(a), undefined);
});

test("下書き: 起動したら、残した下書きを作成先のプロジェクトのチャットのパネルの閉じたタブとして戻す", () => {
  useChatPanelTestStore();
  const a = openNewChat("cwin:9:x", { projectId: 9 });
  // 店を作り直す（再起動）
  useChatPanelTestStore();
  restoreDraftTabs();
  assert.deepEqual(keys("kanban:9"), [a]);
  assert.equal(panelStateOf("kanban:9").open, false);
  discardDraft({ panel: "kanban:9", key: a });
});

test("写しの店（サイドバーの別ウィンドウ）: 下書きの操作はパネルを変えない", () => {
  const store = useChatPanelTestStore();
  const key = "kanban:9102";
  const draftKey = openNewChat(key, { projectId: 9102 });
  const state = panelStateOf(key);
  store.setReplica(true);
  onTestFinished(() => store.setReplica(false));
  dispatchPanel(key, { type: "close", keys: [draftKey], dismiss: false });
  discardDraft({ panel: key, key: draftKey });
  assert.equal(panelStateOf(key), state);
});

test("サイドバーの別ウィンドウの中では、下書きを開く操作もこのウィンドウのパネルを変えずにメインのウィンドウに頼むだけ", () => {
  useChatPanelTestStore();
  // サイドバーの別ウィンドウの種類（本物の表は sidebar の ui/popoutKinds.ts）
  useTestContributions([popoutKinds.item({ kind: "sidebar", fields: {}, label: "", Page: () => null })]);
  vi.stubGlobal("window", { kickoff: { windows: { focusMain: async () => {} } } });
  vi.stubGlobal("location", { hash: "#/projects/1" });
  const key = "kanban:9103";
  const draftKey = openNewChat(key, { projectId: 9103 });
  vi.stubGlobal("location", { hash: "#/popout/sidebar" });
  const before = panelStateOf(key);
  openDraft({ panel: key, key: draftKey });
  discardDraft({ panel: key, key: draftKey });
  assert.equal(panelStateOf(key), before);
});
