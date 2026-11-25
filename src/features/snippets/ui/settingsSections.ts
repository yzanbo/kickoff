// snippets がプロジェクトの設定（設定の節 scope: "project"）に出す節: 定型文（そのプロジェクトで使うもの）
import { MessageSquareQuote } from "lucide-react";
import type { SettingsSectionDef } from "@/features/settings/ui";
import { SnippetSettings } from "./SnippetSettings";

export const projectSnippetsSection: SettingsSectionDef = { id: "snippets", scope: "project", label: "定型文", icon: MessageSquareQuote, order: 50, common: true, Component: SnippetSettings };
