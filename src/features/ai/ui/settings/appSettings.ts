// ai がアプリの設定に出す節: 使用状況・接続・AI の既定
import { Bot, Gauge, PlugZap } from "lucide-react";
import type { SettingsSectionDef } from "@/features/settings/ui";
import { UsagePanel } from "@/features/ai/ui/usage/UsagePanel";
import { ConnectionSettings } from "./ConnectionSettings";
import { AiDefaultsSettings } from "./AiDefaultsSettings";

/** 使用状況（サービスごと。Claude Code はフッターの使用量と同じもの） */
export const usageSection: SettingsSectionDef = { id: "usage", scope: "app", label: "使用状況", icon: Gauge, order: 10, Component: UsagePanel };
export const connectionSection: SettingsSectionDef = { id: "connection", scope: "app", label: "接続", icon: PlugZap, order: 40, Component: ConnectionSettings };
export const aiDefaultsSection: SettingsSectionDef = { id: "ai", scope: "app", label: "AI の既定", icon: Bot, order: 50, Component: AiDefaultsSettings };
