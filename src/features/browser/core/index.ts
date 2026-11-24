// 埋め込みブラウザの機能のコアの入口（ほかの機能はここだけを読む）
import type { BrowserControl } from "@shared/browser/control";
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import type { ChatApi } from "@/features/chat/core/index";
import { browserToolGroup } from "./tools";
import { browserTurnParts } from "./turnParts";

export { browserToolGroup } from "./tools";
export { browserTurnParts } from "./turnParts";

/**
 * 埋め込みブラウザの操作（デスクトップアプリのメインプロセスが渡す。なければ AI にブラウザのツールも「ブラウザ」の節も出さない）。
 * チャットごとに最後に使ったタブを覚え、消したチャットの分は捨てる
 */
export function createBrowser(k: Kernel, deps: { chat: Pick<ChatApi, "addTurnContributor" | "onForget"> }, env: { control?: BrowserControl }): CoreFeature<BrowserControl | undefined> {
  const { control } = env;
  if (!control) return { name: "browser", api: undefined, aiTools: [] };
  const lastTabs = new Map<number, number>();
  deps.chat.onForget((chatId) => void lastTabs.delete(chatId));
  deps.chat.addTurnContributor(browserTurnParts(() => k.settings.get().link_open_in));
  return { name: "browser", api: control, aiTools: [browserToolGroup(control, lastTabs)] };
}
