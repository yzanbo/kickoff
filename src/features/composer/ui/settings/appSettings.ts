// 入力欄がアプリの設定に出す欄: 「表示」のチャット欄の大きさ
import type { SettingsItemDef } from "@/features/settings/ui";
import { ComposerCompactField } from "./DisplayFields";

export const composerCompactItem: SettingsItemDef = { id: "composer.compact", section: "display", order: 20, Component: ComposerCompactField };
