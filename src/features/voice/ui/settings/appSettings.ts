// voice がアプリの設定に出す節: 音声入力
import { Mic } from "lucide-react";
import type { SettingsSectionDef } from "@/features/settings/ui";
import { VoiceSettings } from "./VoiceSettings";

export const voiceSection: SettingsSectionDef = { id: "voice", scope: "app", label: "音声入力", icon: Mic, order: 110, Component: VoiceSettings };
