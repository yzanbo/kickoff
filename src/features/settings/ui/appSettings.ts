// settings がアプリの設定に出す節と欄: 「表示」の節（中身は持ち主の欄）・テーマ
import { Palette } from "lucide-react";
import type { SettingsItemDef, SettingsSectionDef } from "./points";
import { DisplaySettings, ThemeField } from "./DisplaySettings";

export const displaySection: SettingsSectionDef = { id: "display", scope: "app", label: "表示", icon: Palette, order: 20, Component: DisplaySettings };
export const themeItem: SettingsItemDef = { id: "settings.theme", section: "display", order: 10, Component: ThemeField };
