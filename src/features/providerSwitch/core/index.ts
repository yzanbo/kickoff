// AI の切り替えの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { UploadStore } from "@/features/attachments/core/index";
import type { ChatApi, ProviderSwitchPort, Store } from "@/features/chat/core/index";
import { prepareAndCommitProviderSwitch, retryProviderHandoffPreparation } from "./providerSwitch";
import { providerSwitchRoutes } from "./routes";
import { handoffTurnParts } from "./turn";

export { handoffTurnParts } from "./turn";

/** chat の口に登録する、切り替えの準備と確定の中身（段取りは chat の殻） */
export function providerSwitchPort(store: Store, uploads: UploadStore): ProviderSwitchPort {
  return {
    commit: (input, requireStable) => prepareAndCommitProviderSwitch({ store, uploads, requireIdle: requireStable }, input),
    retry: (chatId, claim, requireStable) => retryProviderHandoffPreparation({ store, uploads, requireIdle: requireStable }, chatId, claim),
  };
}

/** AI の切り替え: 切り替えの準備と確定・ルート、チャットの実行に足す引き継ぎの資料・送信中の印・作業の終わりの後始末 */
export function createProviderSwitch(deps: { chat: Pick<ChatApi, "addTurnContributor" | "provideProviderSwitch" | "store" | "runner">; uploads: UploadStore }): CoreFeature {
  const { store, runner } = deps.chat;
  deps.chat.addTurnContributor(handoffTurnParts({ store, uploads: deps.uploads }));
  deps.chat.provideProviderSwitch(providerSwitchPort(store, deps.uploads));
  return { name: "providerSwitch", api: {}, routes: [{ legacy: (app) => providerSwitchRoutes(app, { store, runner }) }] };
}
