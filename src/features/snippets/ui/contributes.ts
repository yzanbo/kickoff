// 拡張点への登録（app/renderer/registry.ts が読む）: 入力欄の定型文の帯と、入力欄の右クリックの帯の表示・非表示・プロジェクトの設定の「定型文」の節
import { composerSlots } from "@/features/composer/ui";
import { settingsItems, settingsSections } from "@/features/settings/ui";
import { projectSnippetsSection } from "./settingsSections";
import { snippetsAppSection, snippetBarItem } from "./appSettings";

export const contributes = [
  composerSlots.item({ kind: "band", id: "snippets", order: 10, load: () => import("./SnippetBar").then((m) => m.SnippetBand) }),
  composerSlots.item({ kind: "menu", id: "snippets", order: 10, load: () => import("./SnippetBar").then((m) => m.SnippetBarToggleItem) }),
  settingsSections.item(projectSnippetsSection),
  // アプリの設定の節・欄
  settingsSections.item(snippetsAppSection),
  settingsItems.item(snippetBarItem),
];
