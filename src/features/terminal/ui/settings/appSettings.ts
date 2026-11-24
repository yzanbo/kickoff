// terminal がアプリの設定に出す節: ターミナル
import { SquareTerminal } from "lucide-react";
import type { SettingsSectionDef } from "@/features/settings/ui";
import { TerminalSettings } from "./TerminalSettings";

export const terminalSection: SettingsSectionDef = { id: "terminal", scope: "app", label: "ターミナル", icon: SquareTerminal, order: 130, Component: TerminalSettings };
