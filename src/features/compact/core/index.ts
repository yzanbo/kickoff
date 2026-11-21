// 圧縮の機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { ChatApi } from "@/features/chat/core/index";
import { compactTurnParts } from "./preCompact";

export { compactTurnParts } from "./preCompact";

/** 圧縮: チャットの実行に、自動の圧縮の前に足す圧縮前指示を登録する（圧縮前・圧縮後の指示の文は設定とプロジェクトから @shared/chat/prompts の compactPromptFor で引く） */
export function createCompact(deps: { chat: Pick<ChatApi, "addTurnContributor" | "store"> }): CoreFeature {
  deps.chat.addTurnContributor(compactTurnParts(deps.chat.store));
  return { name: "compact", api: {} };
}
