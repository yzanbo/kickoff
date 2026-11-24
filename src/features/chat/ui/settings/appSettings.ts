// chat がアプリの設定に出す節: チャット
import { MessageSquare } from "lucide-react";
import type { SettingsSectionDef } from "@/features/settings/ui";
import { ChatSettings } from "./ChatSettings";

export const chatSection: SettingsSectionDef = { id: "chats", scope: "app", label: "チャット", icon: MessageSquare, order: 60, Component: ChatSettings };
