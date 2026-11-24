// 会話がアプリの設定に出す欄: 「表示」の文字の大きさ・横幅・見出し・見出しのバッジ・上に貼り付ける指示
import type { SettingsItemDef } from "@/features/settings/ui";
import { ChatFontSizeField, ChatHeaderBadgeField, ChatHeaderRowField, ChatWideField, StickyPromptField } from "./DisplayFields";

export const conversationDisplayItems: SettingsItemDef[] = [
  { id: "conversation.fontSize", section: "display", order: 30, Component: ChatFontSizeField },
  { id: "conversation.wide", section: "display", order: 40, Component: ChatWideField },
  { id: "conversation.headerRow", section: "display", order: 70, Component: ChatHeaderRowField },
  { id: "conversation.headerBadge", section: "display", order: 80, Component: ChatHeaderBadgeField },
  { id: "conversation.stickyPrompt", section: "display", order: 90, Component: StickyPromptField },
];
