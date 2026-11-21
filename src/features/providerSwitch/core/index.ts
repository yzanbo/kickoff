// AI の切り替えの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { UploadStore } from "@/features/attachments/core/index";
import type { ChatApi } from "@/features/chat/core/index";
import { handoffTurnParts } from "./turn";

export { handoffTurnParts } from "./turn";

/** AI の切り替え: チャットの実行に、引き継ぎの資料・送信中の印・作業の終わりの後始末を登録する（切り替えの段取りはまだ chat の殻。P5-5e で移す） */
export function createProviderSwitch(deps: { chat: Pick<ChatApi, "addTurnContributor" | "store">; uploads: UploadStore }): CoreFeature {
  deps.chat.addTurnContributor(handoffTurnParts({ store: deps.chat.store, uploads: deps.uploads }));
  return { name: "providerSwitch", api: {} };
}
