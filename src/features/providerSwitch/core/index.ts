// AI の切り替えの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import type { UploadStore } from "@/features/attachments/core/index";
import type { ChatApi, ProviderSwitchPort } from "@/features/chat/core/index";
import type { createProviderHandoffs } from "./providerHandoffs";
import { prepareAndCommitProviderSwitch, retryProviderHandoffPreparation } from "./providerSwitch";
import { providerSwitchRoutes } from "./routes";
import { createProviderSwitchStore, type SwitchStore } from "./store";
import { providerHandoffTurnParts } from "./turn";

export { providerHandoffTurnParts } from "./turn";
export { createProviderHandoffs, createProviderHandoffStores, providerHandoffPortOf } from "./providerHandoffs";
export { createProviderSwitchStore } from "./store";

/** chat の口に登録する、切り替えの準備と確定の中身（段取りは chat の殻） */
export function providerSwitchPort(store: SwitchStore, uploads: UploadStore): ProviderSwitchPort {
  return {
    commit: (input, requireStable) => prepareAndCommitProviderSwitch({ store, uploads, requireIdle: requireStable }, input),
    retry: (chatId, claim, requireStable) => retryProviderHandoffPreparation({ store, uploads, requireIdle: requireStable }, chatId, claim),
  };
}

export interface ProviderSwitchDeps {
  chat: Pick<ChatApi, "addTurnContributor" | "provideProviderSwitch" | "store" | "runner" | "chatParam">;
  uploads: UploadStore;
  /** 引き継ぎの店と chat の口（組み立てが chat の前に createProviderHandoffs で作ったもの） */
  providerHandoffs: ReturnType<typeof createProviderHandoffs>;
}

/** AI の切り替え: 切り替えの準備と確定・ルート、チャットの実行に足す引き継ぎの資料・送信中の印・作業の終わりの後始末 */
export function createProviderSwitch(k: Kernel, deps: ProviderSwitchDeps): CoreFeature {
  const { runner } = deps.chat;
  const chat = deps.chat.store;
  const handoffStores = deps.providerHandoffs.stores;
  const store: SwitchStore = { ...chat, ...handoffStores, providerSwitch: createProviderSwitchStore(k.db, (e) => k.bus.publish(e), { ...chat, ...handoffStores }) };
  deps.chat.addTurnContributor(providerHandoffTurnParts({ store, uploads: deps.uploads }));
  deps.chat.provideProviderSwitch(providerSwitchPort(store, deps.uploads));
  return { name: "providerSwitch", api: {}, routes: [providerSwitchRoutes({ store, runner, chatParam: deps.chat.chatParam })] };
}
