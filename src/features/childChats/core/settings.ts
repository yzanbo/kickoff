// 子チャットの設定の PUT の zod（表は @shared/childChats/settings）
import { z } from "zod";
import { defineSettingSchemas } from "@/foundation/core/settings/defineSettingSchemas";
import { childChatSettings } from "@shared/childChats/settings";
import { AI_WRITE_MODES } from "@shared/settings/types";

export const childChatSettingSchemas = defineSettingSchemas(childChatSettings, {
  // チャットの AI がチャット（子・兄弟・親のないチャット）を作るとき（毎回聞く / 聞かずに作る / 作らせない）
  ai_create_chat: z.enum(AI_WRITE_MODES),
  // 共通のチャットの AI がほかのプロジェクトに書くとき（毎回聞く / 聞かずに書く / 書かせない）
  ai_write_other_projects: z.enum(AI_WRITE_MODES),
});
