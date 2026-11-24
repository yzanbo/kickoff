// snippets がアプリの設定に出す節と欄: 定型文・「表示」の定型文の帯
import { MessageSquareQuote } from "lucide-react";
import type { SettingsItemDef, SettingsSectionDef } from "@/features/settings/ui";
import { SnippetSettings } from "./SnippetSettings";
import { SnippetBarField } from "./SnippetBarField";

export const snippetsAppSection: SettingsSectionDef = { id: "snippets", scope: "app", label: "定型文", icon: MessageSquareQuote, order: 70, Component: SnippetSettings };
export const snippetBarItem: SettingsItemDef = { id: "snippets.bar", section: "display", order: 100, Component: SnippetBarField };
