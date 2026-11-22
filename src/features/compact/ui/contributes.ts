// 拡張点への登録（app/renderer/registry.ts が読む）: 入力欄の右下のコンテキストのメーター・プロジェクトの設定の「圧縮前・圧縮後指示」の節
import { composerSlots } from "@/features/composer/ui";
import { settingsSections } from "@/features/settings/ui";
import { projectCompactSection } from "./settingsSections";
import { compactAppSection } from "./appSettings";

export const contributes = [
  composerSlots.item({ kind: "meter", id: "context", load: () => import("./ContextMeter").then((m) => m.ComposerMeter) }),
  settingsSections.item(projectCompactSection),
  // アプリの設定の節・欄
  settingsSections.item(compactAppSection),
];
