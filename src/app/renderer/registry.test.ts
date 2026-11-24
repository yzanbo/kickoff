import assert from "node:assert/strict";
import { afterAll, test, vi } from "vitest";
import { useTestContributions } from "@/foundation/ui/testing/contributions";
import { panelSurfaces, panelTabs, type PanelSurface, type PanelTab } from "@/features/panel/ui";
import { userViewTabs } from "@/features/userView/ui";
import { registryContributions } from "./registry";

// GitHub の本文の部品は DOMPurify（画面のもの）を読み込みで使う（登録の網羅だけを確かめる）
vi.mock("@/features/github/ui/GitHubHtml", () => ({ GitHubHtml: () => null })); // test-rules-ignore: GitHub の本文の部品は読み込みで DOMPurify を使う（登録の網羅だけを見る）
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

test("設定の画面: アプリの節 17 がいまの並びで重ならず、「表示」の欄がいまの順", async () => {
  useTestContributions(registryContributions());
  const { settingsItemsOf, settingsSectionsOf } = await import("@/features/settings/ui");
  const ids = settingsSectionsOf("app").map((s) => s.id);
  assert.deepEqual(ids, ["usage", "display", "sidebar", "connection", "ai", "chats", "snippets", "compact", "notes", "links", "voice", "notifications", "terminal", "browser", "mobile", "trash", "diagnostics"]);
  assert.deepEqual(
    settingsItemsOf("display").map((i) => i.id),
    ["settings.theme", "composer.compact", "conversation.fontSize", "conversation.wide", "chatPanel.tabRow", "chatPanel.viewButton", "conversation.headerRow", "conversation.headerBadge", "conversation.stickyPrompt", "snippets.bar", "subagents.openIn", "childChats.openIn", "childChats.create", "childChats.handoffVia", "childChats.handoffAfter", "notes.openIn", "projects.header", "projects.tabs", "projects.chatPlacement", "shell.footerMode"],
  );
});

test("下の帯: 項目 8 が前の帯の並び（左 7・右 1）で重ならない", async () => {
  useTestContributions(registryContributions());
  const { footerItems } = await import("@/foundation/ui/shell/points");
  const side = (s: "start" | "end") => footerItems.items().filter((i) => i.side === s).map((i) => i.id);
  assert.deepEqual(side("start"), ["settings", "connection", "offline", "toolNotices", "branch", "ports", "restartResume"]);
  assert.deepEqual(side("end"), ["usage"]);
});

test("アプリの根: 置く物が前の App・PopoutApp の並び（order）で重ならず、ダイアログは 6 つ", async () => {
  useTestContributions(registryContributions());
  const { appHosts } = await import("@/foundation/ui/shell/points");
  const placed = (w: "main" | "popout") => appHosts.items().filter((h) => (h.Host || h.dialog) && (h.windows === "both" || h.windows === w)).map((h) => h.id);
  // メインは開くボタン・戻る進む・レイアウトの開閉（order 200）の前後に分けて置く（土台の説明・お知らせ・聞く・落とせない理由は AppShell が足す）
  assert.deepEqual(placed("main"), ["newProject", "noProjectsGuide", "settings", "diagnosticsIndicator", "coreStatusBand", "restartResume", "prNotice", "dbUnlock", "commandPalette", "activeChats", "contentSearch"]);
  assert.deepEqual(placed("popout"), ["coreStatusBand", "dbUnlock"]);
  assert.deepEqual(appHosts.items().flatMap((h) => (h.dialog ? [h.dialog.id] : [])).sort(), ["activeChats", "commandPalette", "contentSearch", "newProject", "noProjectsGuide", "settings"]);
});
