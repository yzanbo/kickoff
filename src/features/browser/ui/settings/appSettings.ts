// browser がアプリの設定に出す節: ブラウザの拡張機能
import { Puzzle } from "lucide-react";
import type { SettingsSectionDef } from "@/features/settings/ui";
import { BrowserExtensionsSection } from "./BrowserExtensionsSection";

export const browserSection: SettingsSectionDef = { id: "browser", scope: "app", label: "ブラウザの拡張機能", icon: Puzzle, order: 140, Component: BrowserExtensionsSection };
