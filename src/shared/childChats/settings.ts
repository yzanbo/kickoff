// 子チャットの設定
import { setting, type SettingTable } from "@shared/foundation/contract/settings";
import type { AiCreateChatMode, AiWriteOtherProjectsMode } from "@shared/settings/types";

export const childChatSettings = {
  /** チャットの AI がチャット（子・兄弟・親のないチャット）を作るとき（承認カードの「常に許可」で allow になる。権限モードによらない） */
  ai_create_chat: setting<AiCreateChatMode>({ default: "ask" }),
  /** 共通のチャットの AI がほかのプロジェクトに書くとき（効く設定の決め方は @shared/chat/aiWritePolicy。「常に許可」で allow になる。権限モードによらない） */
  ai_write_other_projects: setting<AiWriteOtherProjectsMode>({ default: "ask" }),
} as const satisfies SettingTable;
