// 拡張点への登録（app/renderer/registry.ts が読む）: 入力欄の右下のコンテキストのメーター
import { composerSlots } from "@/features/composer/ui";

export const contributes = [composerSlots.item({ kind: "meter", id: "context", load: () => import("./ContextMeter").then((m) => m.ComposerMeter) })];
