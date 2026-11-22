// ai がプロジェクトの設定（設定の節 scope: "project"）に出す節: AI（使う AI と、その AI の新しいチャットの既定）
import { Bot } from "lucide-react";
import type { SettingsSectionDef } from "@/features/settings/ui";
import { ProjectAiSection } from "./ProjectAiSection";

export const projectAiSection: SettingsSectionDef = { id: "ai", scope: "project", label: "AI", icon: Bot, order: 30, Component: ProjectAiSection };
